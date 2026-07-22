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
        attrs = self._inspect_attrs(initializer)
        config = self._required_mapping(attrs, "Config")
        labels = self._required_mapping(config, "Labels")
        actual_image = self._required_field(config, "Image")
        expected_labels = {
            RUN_ID_LABEL: str(run_id),
            ROLE_LABEL: "secret-initializer",
            TOKEN_DIGEST_LABEL: token_digest,
        }
        if (
            getattr(initializer, "name", None) != secret_initializer_name(run_id)
            or actual_image != worker_image
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
        if not isinstance(attrs, dict) or "Labels" not in attrs:
            raise VolumeConflict("Docker volume ownership labels conflict")
        labels = attrs["Labels"]
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
        attrs = self._inspect_attrs(worker)
        config = self._required_mapping(attrs, "Config")
        actual_image = self._required_field(config, "Image")
        if actual_image != worker_image or labels[TOKEN_DIGEST_LABEL] != token_digest:
            raise ContainerConflict("Worker container identity conflicts")

    def _validate_owned_container(
        self, worker: object, run_id: UUID
    ) -> dict[str, str]:
        attrs = self._inspect_attrs(worker)
        config = self._required_mapping(attrs, "Config")
        labels = self._required_field(config, "Labels")
        if not isinstance(labels, dict):
            raise ContainerConflict("Worker container ownership labels are missing")
        if TOKEN_DIGEST_LABEL not in labels:
            raise ContainerConflict("Worker container ownership labels conflict")
        token_digest = labels[TOKEN_DIGEST_LABEL]
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
            or self._required_field(config, "Image")
            not in self.settings.allowed_worker_images
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
        attrs = self._inspect_attrs(container)
        config = self._required_mapping(attrs, "Config")
        host_config = self._required_mapping(attrs, "HostConfig")
        network_settings = self._required_mapping(attrs, "NetworkSettings")
        networks = self._required_field(network_settings, "Networks")
        mounts = self._required_field(attrs, "Mounts")
        image_config = self._image_config(container)
        if (
            self._required_field(config, "User") != "10001:10001"
            or not self._image_execution_policy_matches(config, image_config)
            or self._required_field(host_config, "NetworkMode") != expected_network
            or not self._string_list_matches(
                self._required_field(host_config, "Binds"), expected_binds
            )
            or self._required_field(host_config, "ReadonlyRootfs") is not True
            or not self._no_added_capabilities(
                self._required_field(host_config, "CapAdd")
            )
            or not self._string_list_matches(
                self._required_field(host_config, "CapDrop"), ["ALL"]
            )
            or self._required_field(host_config, "Privileged") is not False
            or not self._no_new_privileges_only(
                self._required_field(host_config, "SecurityOpt")
            )
            or self._required_field(host_config, "Tmpfs") != expected_tmpfs
            or self._required_field(host_config, "Memory") != expected_memory
            or self._required_field(host_config, "NanoCpus") != expected_nano_cpus
            or self._required_field(host_config, "PidsLimit") != expected_pids_limit
            or self._required_field(host_config, "RestartPolicy")
            != expected_restart_policy
            or not self._no_port_bindings(
                self._required_field(host_config, "PortBindings")
            )
            or not self._no_devices(self._required_field(host_config, "Devices"))
            or not self._no_devices(
                self._required_field(host_config, "DeviceRequests")
            )
            or self._required_field(host_config, "PidMode") != ""
            or self._required_field(host_config, "IpcMode") != "private"
            or not isinstance(networks, dict)
            or set(networks) != {expected_network}
            or not all(isinstance(network, dict) for network in networks.values())
            or not self._mounts_match(mounts, expected_mounts)
        ):
            raise ContainerConflict("Container Docker policy conflicts")

    def _validate_container_environment(
        self,
        container: object,
        *,
        overrides: dict[str, str],
    ) -> None:
        attrs = self._inspect_attrs(container)
        config = self._required_mapping(attrs, "Config")
        actual_environment = self._required_field(config, "Env")
        actual = (
            {} if actual_environment is None else self._environment_map(actual_environment)
        )
        image_config = self._image_config(container)
        image_environment = self._required_field(image_config, "Env")
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
    def _no_port_bindings(value: object) -> bool:
        return value is None or value == {}

    @staticmethod
    def _no_devices(value: object) -> bool:
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
            fields = ("Type", "Name", "Destination", "Mode", "RW")
            if any(field not in mount for field in fields):
                return False
            normalized.append(tuple(mount[field] for field in fields))
        return sorted(normalized, key=repr) == sorted(expected, key=repr)

    @classmethod
    def _image_execution_policy_matches(
        cls,
        config: dict[str, object],
        image_config: dict[str, object],
    ) -> bool:
        for field in ("Cmd", "Entrypoint"):
            actual = cls._required_field(config, field)
            expected = cls._required_field(image_config, field)
            if (
                not cls._string_list_or_none(actual)
                or not cls._string_list_or_none(expected)
                or actual != expected
            ):
                return False
        actual_healthcheck = cls._required_field(config, "Healthcheck")
        expected_healthcheck = cls._required_field(image_config, "Healthcheck")
        return (
            cls._canonical_healthcheck(actual_healthcheck)
            and cls._canonical_healthcheck(expected_healthcheck)
            and actual_healthcheck == expected_healthcheck
        )

    @staticmethod
    def _string_list_or_none(value: object) -> bool:
        return value is None or (
            isinstance(value, list) and all(type(item) is str for item in value)
        )

    @staticmethod
    def _canonical_healthcheck(value: object) -> bool:
        if value is None:
            return True
        if not isinstance(value, dict):
            return False
        allowed = {
            "Test",
            "Interval",
            "Timeout",
            "Retries",
            "StartPeriod",
            "StartInterval",
        }
        if not value or set(value) - allowed or "Test" not in value:
            return False
        test = value["Test"]
        if (
            not isinstance(test, list)
            or not test
            or any(type(item) is not str for item in test)
            or test[0] not in {"NONE", "CMD", "CMD-SHELL"}
        ):
            return False
        return all(
            type(field_value) is int and field_value >= 0
            for field, field_value in value.items()
            if field != "Test"
        )

    @staticmethod
    def _inspect_attrs(container: object) -> dict[str, object]:
        attrs = getattr(container, "attrs", None)
        if not isinstance(attrs, dict):
            raise ContainerConflict("Container inspect data is unavailable")
        return attrs

    @staticmethod
    def _required_field(mapping: dict[str, object], field: str) -> object:
        if field not in mapping:
            raise ContainerConflict("Container inspect data is incomplete")
        return mapping[field]

    @classmethod
    def _required_mapping(
        cls, mapping: dict[str, object], field: str
    ) -> dict[str, object]:
        value = cls._required_field(mapping, field)
        if not isinstance(value, dict):
            raise ContainerConflict("Container inspect data is malformed")
        return value

    @classmethod
    def _image_config(cls, container: object) -> dict[str, object]:
        image = getattr(container, "image", None)
        image_attrs = getattr(image, "attrs", None)
        if not isinstance(image_attrs, dict):
            raise ContainerConflict("Container image inspect data is unavailable")
        return cls._required_mapping(image_attrs, "Config")

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
        attrs = DockerRuntime._inspect_attrs(worker)
        state = DockerRuntime._required_mapping(attrs, "State")
        value = DockerRuntime._required_field(state, "Status")
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
