"""Allowlisted Docker SDK adapter with a fixed per-run Worker policy."""

from __future__ import annotations

import hashlib
import io
import tarfile
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from integrity_service.controller.settings import ControllerSettings


RUN_ID_LABEL = "qjudge.integrity.run_id"
ROLE_LABEL = "qjudge.integrity.role"
KIND_LABEL = "qjudge.integrity.kind"
TOKEN_DIGEST_LABEL = "qjudge.integrity.run_token_sha256"


class ControllerConflict(RuntimeError):
    """An exact-name Docker resource cannot safely satisfy the requested run."""


class ImageNotAllowed(ControllerConflict):
    """The requested Worker image is outside the immutable allowlist."""


class ContainerConflict(ControllerConflict):
    """A same-name container has conflicting ownership or identity."""


class ContainerNotStopped(ControllerConflict):
    """Destroy was attempted before Docker observed a stopped container."""


class VolumeConflict(ControllerConflict):
    """A same-name volume does not carry the exact run-scoped labels."""


@dataclass(frozen=True, slots=True)
class StartResult:
    container_id: str
    container_name: str
    worker_url: str
    image_digest: str
    state: Literal["running"]
    run_token_sha256: str


@dataclass(frozen=True, slots=True)
class StopResult:
    run_id: UUID
    state: Literal["absent", "stopped"]


@dataclass(frozen=True, slots=True)
class DestroyResult:
    run_id: UUID
    destroyed: bool
    data_volume_retained: Literal[True]


@dataclass(frozen=True, slots=True)
class PurgeDataResult:
    run_id: UUID
    data_purged: bool


@dataclass(frozen=True, slots=True)
class RunStatus:
    run_id: UUID
    exists: bool
    state: Literal["absent", "created", "running", "stopping", "stopped", "exited"]
    container_id: str = ""
    container_name: str = ""
    worker_url: str = ""
    image_digest: str = ""
    run_token_sha256: str = ""


def container_name(run_id: UUID) -> str:
    return "qjudge-integrity-worker-" + str(run_id)


def data_volume_name(run_id: UUID) -> str:
    return "qjudge-integrity-data-" + str(run_id)


def secret_volume_name(run_id: UUID) -> str:
    return "qjudge-integrity-secret-" + str(run_id)


def secret_initializer_name(run_id: UUID) -> str:
    return "qjudge-integrity-secret-init-" + str(run_id)


def _is_not_found(error: BaseException) -> bool:
    if getattr(error, "status_code", None) == 404:
        return True
    response = getattr(error, "response", None)
    return getattr(response, "status_code", None) == 404


class DockerRuntime:
    """Own only fixed Docker lifecycle mechanics; never inspect exam state."""

    def __init__(self, *, client: object, settings: ControllerSettings) -> None:
        self.client = client
        self.settings = settings

    def start(
        self,
        run_id: UUID,
        run_token: str,
        worker_image: str,
    ) -> StartResult:
        self._validate_run_id(run_id)
        if type(run_token) is not str or not run_token:
            raise ValueError("run_token must be a non-empty string")
        if worker_image not in self.settings.allowed_worker_images:
            raise ImageNotAllowed("Worker image is not allowlisted")

        token_digest = hashlib.sha256(run_token.encode("utf-8")).hexdigest()
        existing = self._find_container(run_id)
        if existing is not None:
            self._validate_container(
                existing,
                run_id=run_id,
                worker_image=worker_image,
                token_digest=token_digest,
            )
            state = self._container_state(existing)
            if state == "running":
                return self._start_result(existing, token_digest=token_digest)
            if state not in {"created", "exited"}:
                raise ContainerConflict("Worker container is not startable")
            existing.start()
            return self._start_result(existing, token_digest=token_digest)

        data_volume = self._get_or_create_volume(run_id, kind="data")
        secret_volume = self._get_or_create_volume(run_id, kind="secret")
        self._populate_secret_volume(
            run_id=run_id,
            run_token=run_token,
            worker_image=worker_image,
            token_digest=token_digest,
            secret_volume=secret_volume,
        )
        worker = self.client.containers.create(
            image=worker_image,
            name=container_name(run_id),
            environment=self._worker_environment(run_id),
            volumes={
                data_volume.name: {"bind": "/run-data", "mode": "rw"},
                secret_volume.name: {"bind": "/run-secrets", "mode": "ro"},
            },
            network=self.settings.worker_network,
            user="10001:10001",
            read_only=True,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=64m"},
            cap_drop=["ALL"],
            security_opt=["no-new-privileges"],
            privileged=False,
            mem_limit="512m",
            nano_cpus=500_000_000,
            pids_limit=128,
            restart_policy={"Name": "unless-stopped"},
            labels={
                RUN_ID_LABEL: str(run_id),
                ROLE_LABEL: "worker",
                TOKEN_DIGEST_LABEL: token_digest,
            },
        )
        worker.start()
        return self._start_result(worker, token_digest=token_digest)

    def stop(self, run_id: UUID) -> StopResult:
        self._validate_run_id(run_id)
        worker = self._find_container(run_id)
        if worker is None:
            return StopResult(run_id=run_id, state="absent")
        self._validate_owned_container(worker, run_id)
        state = self._container_state(worker)
        if state in {"created", "exited"}:
            return StopResult(run_id=run_id, state="stopped")
        if state not in {"running", "restarting", "paused"}:
            raise ContainerConflict("Worker container cannot be safely stopped")
        worker.stop(timeout=30)
        return StopResult(run_id=run_id, state="stopped")

    def destroy(self, run_id: UUID) -> DestroyResult:
        self._validate_run_id(run_id)
        worker = self._find_container(run_id)
        destroyed = False
        if worker is not None:
            self._validate_owned_container(worker, run_id)
            if self._container_state(worker) not in {"created", "exited"}:
                raise ContainerNotStopped("Worker container must be stopped")
            worker.remove()
            destroyed = True
        self._remove_volume_if_present(run_id, kind="secret")
        return DestroyResult(
            run_id=run_id,
            destroyed=destroyed,
            data_volume_retained=True,
        )

    def purge_data(self, run_id: UUID) -> PurgeDataResult:
        self._validate_run_id(run_id)
        if self._find_container(run_id) is not None:
            raise ContainerConflict("Worker container must be absent before purge")
        purged = self._remove_volume_if_present(run_id, kind="data")
        return PurgeDataResult(run_id=run_id, data_purged=purged)

    def status(self, run_id: UUID) -> RunStatus:
        self._validate_run_id(run_id)
        worker = self._find_container(run_id)
        if worker is None:
            return RunStatus(run_id=run_id, exists=False, state="absent")
        labels = self._validate_owned_container(worker, run_id)
        raw_state = self._container_state(worker)
        state = self._public_state(raw_state)
        return RunStatus(
            run_id=run_id,
            exists=True,
            state=state,
            container_id=self._required_string(worker.id, "container id"),
            container_name=self._required_string(worker.name, "container name"),
            worker_url="http://" + container_name(run_id) + ":8020",
            image_digest=self._image_digest(worker),
            run_token_sha256=labels[TOKEN_DIGEST_LABEL],
        )

    def close(self) -> None:
        close = getattr(self.client, "close", None)
        if callable(close):
            close()

    def _find_container(self, run_id: UUID):
        return self._find_named_container(container_name(run_id))

    def _find_named_container(self, name: str):
        try:
            return self.client.containers.get(name)
        except Exception as error:
            if _is_not_found(error):
                return None
            raise

    def _get_or_create_volume(self, run_id: UUID, *, kind: Literal["data", "secret"]):
        name = data_volume_name(run_id) if kind == "data" else secret_volume_name(run_id)
        try:
            volume = self.client.volumes.get(name)
        except Exception as error:
            if not _is_not_found(error):
                raise
            volume = self.client.volumes.create(
                name=name,
                labels={RUN_ID_LABEL: str(run_id), KIND_LABEL: kind},
            )
        self._validate_volume(volume, run_id=run_id, kind=kind)
        return volume

    def _populate_secret_volume(
        self,
        *,
        run_id: UUID,
        run_token: str,
        worker_image: str,
        token_digest: str,
        secret_volume: object,
    ) -> None:
        initializer_name = secret_initializer_name(run_id)
        stale = self._find_named_container(initializer_name)
        if stale is not None:
            self._validate_secret_initializer(
                stale,
                run_id=run_id,
                worker_image=worker_image,
                token_digest=token_digest,
            )
            stale.remove()
        initializer = self.client.containers.create(
            image=worker_image,
            name=initializer_name,
            volumes={
                secret_volume.name: {"bind": "/run-secrets", "mode": "rw"},
            },
            network_mode="none",
            user="10001:10001",
            read_only=True,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=16m"},
            cap_drop=["ALL"],
            security_opt=["no-new-privileges"],
            privileged=False,
            mem_limit="64m",
            nano_cpus=100_000_000,
            pids_limit=16,
            restart_policy={"Name": "no"},
            labels={
                RUN_ID_LABEL: str(run_id),
                ROLE_LABEL: "secret-initializer",
                TOKEN_DIGEST_LABEL: token_digest,
            },
        )
        try:
            archive = self._token_archive(run_token.encode("utf-8"))
            if initializer.put_archive("/run-secrets", archive) is False:
                raise OSError("Docker did not populate the Worker credential")
        finally:
            initializer.remove()

    def _validate_secret_initializer(
        self,
        initializer: object,
        *,
        run_id: UUID,
        worker_image: str,
        token_digest: str,
    ) -> None:
        attrs = getattr(initializer, "attrs", None)
        config = attrs.get("Config") if isinstance(attrs, dict) else None
        labels = config.get("Labels") if isinstance(config, dict) else None
        expected_labels = {
            RUN_ID_LABEL: str(run_id),
            ROLE_LABEL: "secret-initializer",
            TOKEN_DIGEST_LABEL: token_digest,
        }
        if (
            getattr(initializer, "name", None) != secret_initializer_name(run_id)
            or not isinstance(config, dict)
            or config.get("Image") != worker_image
            or labels != expected_labels
            or self._container_state(initializer) != "created"
        ):
            raise ContainerConflict("Secret initializer identity conflicts")
        self._validate_fixed_policy(
            initializer,
            expected_network="none",
            expected_binds=[secret_volume_name(run_id) + ":/run-secrets:rw"],
            expected_mounts=[
                (
                    "volume",
                    secret_volume_name(run_id),
                    "/run-secrets",
                    "rw",
                    True,
                )
            ],
            expected_tmpfs={"/tmp": "rw,noexec,nosuid,size=16m"},
            expected_memory=64 * 1024 * 1024,
            expected_nano_cpus=100_000_000,
            expected_pids_limit=16,
            expected_restart_policy={"Name": "no", "MaximumRetryCount": 0},
        )
        self._validate_container_environment(initializer, overrides={})

    def _remove_volume_if_present(
        self, run_id: UUID, *, kind: Literal["data", "secret"]
    ) -> bool:
        name = data_volume_name(run_id) if kind == "data" else secret_volume_name(run_id)
        try:
            volume = self.client.volumes.get(name)
        except Exception as error:
            if _is_not_found(error):
                return False
            raise
        self._validate_volume(volume, run_id=run_id, kind=kind)
        try:
            volume.remove()
        except Exception as error:
            if _is_not_found(error):
                return False
            raise
        return True

    @staticmethod
    def _validate_volume(volume: object, *, run_id: UUID, kind: str) -> None:
        attrs = getattr(volume, "attrs", None)
        labels = attrs.get("Labels") if isinstance(attrs, dict) else None
        expected = {RUN_ID_LABEL: str(run_id), KIND_LABEL: kind}
        if labels != expected:
            raise VolumeConflict("Docker volume ownership labels conflict")

    def _validate_container(
        self,
        worker: object,
        *,
        run_id: UUID,
        worker_image: str,
        token_digest: str,
    ) -> None:
        labels = self._validate_owned_container(worker, run_id)
        attrs = getattr(worker, "attrs", None)
        config = attrs.get("Config") if isinstance(attrs, dict) else None
        actual_image = config.get("Image") if isinstance(config, dict) else None
        if actual_image != worker_image or labels[TOKEN_DIGEST_LABEL] != token_digest:
            raise ContainerConflict("Worker container identity conflicts")

    def _validate_owned_container(
        self, worker: object, run_id: UUID
    ) -> dict[str, str]:
        attrs = getattr(worker, "attrs", None)
        config = attrs.get("Config") if isinstance(attrs, dict) else None
        labels = config.get("Labels") if isinstance(config, dict) else None
        if not isinstance(labels, dict):
            raise ContainerConflict("Worker container ownership labels are missing")
        token_digest = labels.get(TOKEN_DIGEST_LABEL)
        expected_labels = {
            RUN_ID_LABEL: str(run_id),
            ROLE_LABEL: "worker",
            TOKEN_DIGEST_LABEL: token_digest,
        }
        if (
            type(token_digest) is not str
            or len(token_digest) != 64
            or any(character not in "0123456789abcdef" for character in token_digest)
            or labels != expected_labels
        ):
            raise ContainerConflict("Worker container ownership labels conflict")
        if (
            getattr(worker, "name", None) != container_name(run_id)
            or config.get("Image") not in self.settings.allowed_worker_images
        ):
            raise ContainerConflict("Worker container identity conflicts")
        self._validate_fixed_policy(
            worker,
            expected_network=self.settings.worker_network,
            expected_binds=[
                data_volume_name(run_id) + ":/run-data:rw",
                secret_volume_name(run_id) + ":/run-secrets:ro",
            ],
            expected_mounts=[
                (
                    "volume",
                    data_volume_name(run_id),
                    "/run-data",
                    "rw",
                    True,
                ),
                (
                    "volume",
                    secret_volume_name(run_id),
                    "/run-secrets",
                    "ro",
                    False,
                ),
            ],
            expected_tmpfs={"/tmp": "rw,noexec,nosuid,size=64m"},
            expected_memory=512 * 1024 * 1024,
            expected_nano_cpus=500_000_000,
            expected_pids_limit=128,
            expected_restart_policy={
                "Name": "unless-stopped",
                "MaximumRetryCount": 0,
            },
        )
        self._validate_container_environment(
            worker,
            overrides=self._worker_environment(run_id),
        )
        return labels

    def _validate_fixed_policy(
        self,
        container: object,
        *,
        expected_network: str,
        expected_binds: list[str],
        expected_mounts: list[tuple[str, str, str, str, bool]],
        expected_tmpfs: dict[str, str],
        expected_memory: int,
        expected_nano_cpus: int,
        expected_pids_limit: int,
        expected_restart_policy: dict[str, object],
    ) -> None:
        attrs = getattr(container, "attrs", None)
        config = attrs.get("Config") if isinstance(attrs, dict) else None
        host_config = attrs.get("HostConfig") if isinstance(attrs, dict) else None
        network_settings = attrs.get("NetworkSettings") if isinstance(attrs, dict) else None
        networks = (
            network_settings.get("Networks")
            if isinstance(network_settings, dict)
            else None
        )
        if (
            not isinstance(config, dict)
            or not isinstance(host_config, dict)
            or config.get("User") != "10001:10001"
            or host_config.get("NetworkMode") != expected_network
            or not self._string_list_matches(
                host_config.get("Binds"), expected_binds
            )
            or host_config.get("ReadonlyRootfs") is not True
            or not self._no_added_capabilities(host_config.get("CapAdd"))
            or not self._string_list_matches(host_config.get("CapDrop"), ["ALL"])
            or host_config.get("Privileged") is not False
            or not self._no_new_privileges_only(host_config.get("SecurityOpt"))
            or host_config.get("Tmpfs") != expected_tmpfs
            or host_config.get("Memory") != expected_memory
            or host_config.get("NanoCpus") != expected_nano_cpus
            or host_config.get("PidsLimit") != expected_pids_limit
            or host_config.get("RestartPolicy") != expected_restart_policy
            or not isinstance(networks, dict)
            or set(networks) != {expected_network}
            or not self._mounts_match(attrs.get("Mounts"), expected_mounts)
        ):
            raise ContainerConflict("Container Docker policy conflicts")

    def _validate_container_environment(
        self,
        container: object,
        *,
        overrides: dict[str, str],
    ) -> None:
        attrs = getattr(container, "attrs", None)
        config = attrs.get("Config") if isinstance(attrs, dict) else None
        if not isinstance(config, dict):
            raise ContainerConflict("Container environment is unavailable")
        actual_environment = config.get("Env")
        actual = (
            {} if actual_environment is None else self._environment_map(actual_environment)
        )
        image = getattr(container, "image", None)
        image_attrs = getattr(image, "attrs", None)
        image_config = image_attrs.get("Config") if isinstance(image_attrs, dict) else None
        if not isinstance(image_config, dict):
            raise ContainerConflict("Container image environment is unavailable")
        image_environment = image_config.get("Env")
        if image_environment is None:
            expected: dict[str, str] | None = {}
        else:
            expected = self._environment_map(image_environment)
        if expected is None:
            raise ContainerConflict("Container image environment is invalid")
        expected.update(overrides)
        if actual != expected:
            raise ContainerConflict("Container environment conflicts")

    def _worker_environment(self, run_id: UUID) -> dict[str, str]:
        return {
            "INTEGRITY_RUN_ID": str(run_id),
            "BACKEND_INTERNAL_URL": self.settings.backend_internal_url,
            "RUN_TOKEN_FILE": "/run-secrets/token",
            "RUN_DATA_DIR": "/run-data",
        }

    @staticmethod
    def _environment_map(value: object) -> dict[str, str] | None:
        if not isinstance(value, list):
            return None
        result: dict[str, str] = {}
        for entry in value:
            if type(entry) is not str or "=" not in entry:
                return None
            key, entry_value = entry.split("=", 1)
            if not key or key in result:
                return None
            result[key] = entry_value
        return result

    @staticmethod
    def _string_list_matches(actual: object, expected: list[str]) -> bool:
        return (
            isinstance(actual, list)
            and len(actual) == len(expected)
            and all(type(item) is str for item in actual)
            and sorted(actual) == sorted(expected)
        )

    @staticmethod
    def _no_added_capabilities(value: object) -> bool:
        return value is None or value == []

    @staticmethod
    def _no_new_privileges_only(value: object) -> bool:
        return isinstance(value, list) and value in (
            ["no-new-privileges"],
            ["no-new-privileges:true"],
        )

    @staticmethod
    def _mounts_match(
        actual: object,
        expected: list[tuple[str, str, str, str, bool]],
    ) -> bool:
        if not isinstance(actual, list) or len(actual) != len(expected):
            return False
        normalized = []
        for mount in actual:
            if not isinstance(mount, dict):
                return False
            normalized.append(
                (
                    mount.get("Type"),
                    mount.get("Name"),
                    mount.get("Destination"),
                    mount.get("Mode"),
                    mount.get("RW"),
                )
            )
        return sorted(normalized, key=repr) == sorted(expected, key=repr)

    def _start_result(self, worker: object, *, token_digest: str) -> StartResult:
        return StartResult(
            container_id=self._required_string(worker.id, "container id"),
            container_name=self._required_string(worker.name, "container name"),
            worker_url="http://" + self._required_string(worker.name, "container name") + ":8020",
            image_digest=self._image_digest(worker),
            state="running",
            run_token_sha256=token_digest,
        )

    @staticmethod
    def _image_digest(worker: object) -> str:
        image = getattr(worker, "image", None)
        digest = getattr(image, "id", None)
        return DockerRuntime._required_string(digest, "image digest")

    @staticmethod
    def _container_state(worker: object) -> str:
        attrs = getattr(worker, "attrs", None)
        state = attrs.get("State") if isinstance(attrs, dict) else None
        value = state.get("Status") if isinstance(state, dict) else None
        if not isinstance(value, str) or not value:
            value = getattr(worker, "status", None)
        return DockerRuntime._required_string(value, "container state")

    @staticmethod
    def _public_state(raw_state: str):
        if raw_state in {"created", "running", "exited"}:
            return raw_state
        if raw_state == "restarting":
            return "running"
        raise ContainerConflict("Worker container state is unsupported")

    @staticmethod
    def _required_string(value: object, name: str) -> str:
        if type(value) is not str or not value:
            raise ContainerConflict(name + " is unavailable")
        return value

    @staticmethod
    def _validate_run_id(run_id: UUID) -> None:
        if type(run_id) is not UUID or run_id.int == 0:
            raise ValueError("run_id must be a non-zero UUID")

    @staticmethod
    def _token_archive(token: bytes) -> bytes:
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as archive:
            member = tarfile.TarInfo("token")
            member.size = len(token)
            member.uid = 10001
            member.gid = 10001
            member.mode = 0o400
            member.mtime = 0
            archive.addfile(member, io.BytesIO(token))
        return stream.getvalue()
