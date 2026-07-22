"""Allowlisted Docker SDK adapter with a fixed per-run Worker policy."""

from __future__ import annotations

import copy
import hashlib
import ipaddress
import io
import re
import tarfile
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from integrity_service.controller.settings import ControllerSettings


RUN_ID_LABEL = "qjudge.integrity.run_id"
ROLE_LABEL = "qjudge.integrity.role"
KIND_LABEL = "qjudge.integrity.kind"
TOKEN_DIGEST_LABEL = "qjudge.integrity.run_token_sha256"

BASE_MASKED_PATHS = [
    "/proc/acpi",
    "/proc/asound",
    "/proc/interrupts",
    "/proc/kcore",
    "/proc/keys",
    "/proc/latency_stats",
    "/proc/sched_debug",
    "/proc/scsi",
    "/proc/timer_list",
    "/proc/timer_stats",
    "/sys/devices/system/cpu",
    "/sys/devices/virtual/powercap",
    "/sys/firmware",
]
READONLY_PATHS = [
    "/proc/bus",
    "/proc/fs",
    "/proc/irq",
    "/proc/sys",
    "/proc/sysrq-trigger",
]
IMAGE_INHERITED_CONFIG_FIELDS = (
    "Cmd",
    "Entrypoint",
    "ExposedPorts",
    "Healthcheck",
    "Shell",
    "Volumes",
)
OPTIONAL_IMAGE_CONFIG_FIELDS = frozenset(
    {"Entrypoint", "Healthcheck", "Shell", "Volumes"}
)
OPTIONAL_HOST_CONFIG = {
    "Annotations": None,
    "KernelMemoryTCP": 0,
    "Mounts": [],
}
CALLER_ENDPOINT_FIELDS = frozenset(
    {"Aliases", "DNSNames", "DriverOpts", "GwPriority", "IPAMConfig", "Links"}
)
DAEMON_ENDPOINT_FIELDS = frozenset(
    {
        "EndpointID",
        "Gateway",
        "GlobalIPv6Address",
        "GlobalIPv6PrefixLen",
        "IPAddress",
        "IPPrefixLen",
        "IPv6Gateway",
        "MacAddress",
        "NetworkID",
    }
)
MAC_ADDRESS_PATTERN = re.compile(r"(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}\Z")
SAFE_EMPTY_SEQUENCE_FIELDS = frozenset(
    {
        "CapAdd",
        "DeviceCgroupRules",
        "DeviceRequests",
        "Devices",
        "Dns",
        "DnsOptions",
        "DnsSearch",
        "ExtraHosts",
        "GroupAdd",
        "Links",
        "LxcConf",
        "Ulimits",
        "VolumesFrom",
    }
)
SAFE_EMPTY_MAPPING_FIELDS = frozenset({"PortBindings", "StorageOpt", "Sysctls"})


@dataclass(frozen=True, slots=True)
class ContainerPolicy:
    """Single source for container creation and closed-world attestation."""

    name: str
    image: str
    environment_overrides: dict[str, str]
    fixed_config: dict[str, object]
    host_config: dict[str, object]
    optional_host_config: dict[str, object]
    mounts: list[tuple[str, str, str, str, bool]]
    network: str
    docker_api_version: tuple[int, int]

    @property
    def config_fields(self) -> frozenset[str]:
        return frozenset(
            {*self.fixed_config, *IMAGE_INHERITED_CONFIG_FIELDS, "Env"}
        )

    @property
    def optional_config_fields(self) -> frozenset[str]:
        fields = {"ArgsEscaped", "MacAddress", "OnBuild"}
        if self.fixed_config["NetworkDisabled"] is False:
            fields.add("NetworkDisabled")
        return frozenset(fields)

    @property
    def required_config_fields(self) -> frozenset[str]:
        return self.config_fields - self.optional_config_fields

    @property
    def required_endpoint_fields(self) -> frozenset[str]:
        fields = {"Aliases", "DriverOpts", "IPAMConfig", "Links"}
        if self.docker_api_version >= (1, 44):
            fields.add("DNSNames")
        if self.docker_api_version >= (1, 48):
            fields.add("GwPriority")
        return frozenset(fields)

    def inspect_config(self, image_config: dict[str, object]) -> dict[str, object]:
        """Build a canonical inspect fixture from this same policy contract."""

        expected = copy.deepcopy(self.fixed_config)
        for field in IMAGE_INHERITED_CONFIG_FIELDS:
            expected[field] = copy.deepcopy(image_config[field])
        image_environment = image_config["Env"]
        if image_environment is None:
            environment: list[str] = []
        else:
            environment = list(image_environment)
        override_keys = set(self.environment_overrides)
        environment = [
            entry for entry in environment if entry.split("=", 1)[0] not in override_keys
        ]
        environment.extend(
            key + "=" + value for key, value in self.environment_overrides.items()
        )
        expected["Env"] = environment
        return expected

    def create_kwargs(self) -> dict[str, object]:
        """Return the low-level Docker create request derived from this policy."""

        network_disabled = self.fixed_config["NetworkDisabled"]
        networking_config = (
            None
            if network_disabled
            else {"EndpointsConfig": {self.network: None}}
        )
        return {
            "command": None,
            "detach": True,
            "domainname": self.fixed_config["Domainname"],
            "entrypoint": None,
            "environment": self.environment_overrides or None,
            "healthcheck": None,
            "host_config": copy.deepcopy(self.host_config),
            "hostname": self.fixed_config["Hostname"],
            "image": self.image,
            "labels": copy.deepcopy(self.fixed_config["Labels"]),
            "name": self.name,
            "network_disabled": network_disabled,
            "networking_config": networking_config,
            "stdin_open": False,
            "stop_signal": self.fixed_config["StopSignal"],
            "stop_timeout": self.fixed_config["StopTimeout"],
            "tty": False,
            "use_config_proxy": False,
            "user": self.fixed_config["User"],
            "working_dir": self.fixed_config["WorkingDir"],
        }


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


def build_container_policy(
    *,
    role: Literal["worker", "secret-initializer"],
    run_id: UUID,
    image: str,
    token_digest: str,
    backend_internal_url: str,
    worker_network: str,
    docker_api_version: tuple[int, int] = (1, 48),
) -> ContainerPolicy:
    """Build the complete creation and attestation policy for one role."""

    if (
        not isinstance(docker_api_version, tuple)
        or len(docker_api_version) != 2
        or any(type(part) is not int or part < 0 for part in docker_api_version)
    ):
        raise ValueError("docker_api_version must be a major/minor integer tuple")

    is_initializer = role == "secret-initializer"
    if is_initializer:
        name = secret_initializer_name(run_id)
        hostname = "integrity-init-" + run_id.hex
        environment_overrides: dict[str, str] = {}
        binds = [secret_volume_name(run_id) + ":/run-secrets:rw"]
        mounts = [
            (
                "volume",
                secret_volume_name(run_id),
                "/run-secrets",
                "rw",
                True,
            )
        ]
        network = "none"
        tmpfs = {"/tmp": "rw,noexec,nosuid,size=16m"}
        memory = 64 * 1024 * 1024
        nano_cpus = 100_000_000
        pids_limit = 16
        restart_policy: dict[str, object] = {
            "Name": "no",
            "MaximumRetryCount": 0,
        }
    else:
        name = container_name(run_id)
        hostname = "integrity-worker-" + run_id.hex
        environment_overrides = {
            "INTEGRITY_RUN_ID": str(run_id),
            "BACKEND_INTERNAL_URL": backend_internal_url,
            "RUN_TOKEN_FILE": "/run-secrets/token",
            "RUN_DATA_DIR": "/run-data",
        }
        binds = [
            data_volume_name(run_id) + ":/run-data:rw",
            secret_volume_name(run_id) + ":/run-secrets:ro",
        ]
        mounts = [
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
        ]
        network = worker_network
        tmpfs = {"/tmp": "rw,noexec,nosuid,size=64m"}
        memory = 512 * 1024 * 1024
        nano_cpus = 500_000_000
        pids_limit = 128
        restart_policy = {
            "Name": "unless-stopped",
            "MaximumRetryCount": 0,
        }

    labels = {
        RUN_ID_LABEL: str(run_id),
        ROLE_LABEL: role,
        TOKEN_DIGEST_LABEL: token_digest,
    }
    fixed_config: dict[str, object] = {
        "AttachStderr": False,
        "AttachStdin": False,
        "AttachStdout": False,
        "ArgsEscaped": False,
        "Domainname": "",
        "Hostname": hostname,
        "Image": image,
        "Labels": labels,
        "MacAddress": "",
        "NetworkDisabled": is_initializer,
        "OnBuild": None,
        "OpenStdin": False,
        "StdinOnce": False,
        "StopSignal": "SIGTERM",
        "StopTimeout": 30,
        "Tty": False,
        "User": "10001:10001",
        "WorkingDir": "/app",
    }
    host_config: dict[str, object] = {
        "AutoRemove": False,
        "Binds": binds,
        "BlkioDeviceReadBps": [],
        "BlkioDeviceReadIOps": [],
        "BlkioDeviceWriteBps": [],
        "BlkioDeviceWriteIOps": [],
        "BlkioWeight": 0,
        "BlkioWeightDevice": [],
        "CPURealtimePeriod": 0,
        "CPURealtimeRuntime": 0,
        "CapAdd": None,
        "CapDrop": ["ALL"],
        "Cgroup": "",
        "CgroupParent": "",
        "CgroupnsMode": "private",
        "CpuCount": 0,
        "CpuPercent": 0,
        "CpuPeriod": 0,
        "CpuQuota": 0,
        "CpuShares": 0,
        "CpusetCpus": "",
        "CpusetMems": "",
        "ContainerIDFile": "",
        "ConsoleSize": [0, 0],
        "DeviceCgroupRules": None,
        "DeviceRequests": None,
        "Devices": [],
        "Dns": [],
        "DnsOptions": [],
        "DnsSearch": [],
        "ExtraHosts": [],
        "GroupAdd": [],
        "Init": False,
        "IOMaximumBandwidth": 0,
        "IOMaximumIOps": 0,
        "IpcMode": "private",
        "Isolation": "",
        "KernelMemory": 0,
        "Links": [],
        "LogConfig": {"Type": "none", "Config": {}},
        "LxcConf": [],
        "MaskedPaths": list(BASE_MASKED_PATHS),
        "Memory": memory,
        "MemoryReservation": 0,
        "MemorySwap": memory,
        "MemorySwappiness": 0,
        "NanoCpus": nano_cpus,
        "NetworkMode": network,
        "OomKillDisable": False,
        "OomScoreAdj": 0,
        "PidMode": "",
        "PidsLimit": pids_limit,
        "PortBindings": {},
        "Privileged": False,
        "PublishAllPorts": False,
        "ReadonlyPaths": list(READONLY_PATHS),
        "ReadonlyRootfs": True,
        "RestartPolicy": restart_policy,
        "Runtime": "runc",
        "SecurityOpt": ["no-new-privileges"],
        "ShmSize": 64 * 1024 * 1024,
        "StorageOpt": {},
        "Sysctls": {},
        "Tmpfs": tmpfs,
        "UTSMode": "",
        "Ulimits": [],
        "UsernsMode": "",
        "VolumeDriver": "",
        "VolumesFrom": [],
    }
    return ContainerPolicy(
        name=name,
        image=image,
        environment_overrides=environment_overrides,
        fixed_config=fixed_config,
        host_config=host_config,
        optional_host_config=copy.deepcopy(OPTIONAL_HOST_CONFIG),
        mounts=mounts,
        network=network,
        docker_api_version=docker_api_version,
    )


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

        self._get_or_create_volume(run_id, kind="data")
        self._get_or_create_volume(run_id, kind="secret")
        self._populate_secret_volume(
            run_id=run_id,
            run_token=run_token,
            worker_image=worker_image,
            token_digest=token_digest,
        )
        worker_policy = self._container_policy(
            role="worker",
            run_id=run_id,
            image=worker_image,
            token_digest=token_digest,
        )
        worker = self._create_policy_container(worker_policy)
        self._validate_container(
            worker,
            run_id=run_id,
            worker_image=worker_image,
            token_digest=token_digest,
        )
        if self._container_state(worker) != "created":
            raise ContainerConflict("Fresh Worker container is not stopped")
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
        initializer_policy = self._container_policy(
            role="secret-initializer",
            run_id=run_id,
            image=worker_image,
            token_digest=token_digest,
        )
        initializer = self._create_policy_container(initializer_policy)
        self._validate_secret_initializer(
            initializer,
            run_id=run_id,
            worker_image=worker_image,
            token_digest=token_digest,
        )
        try:
            archive = self._token_archive(run_token.encode("utf-8"))
            if initializer.put_archive("/run-secrets", archive) is False:
                raise OSError("Docker did not populate the Worker credential")
        finally:
            initializer.remove()

    def _create_policy_container(self, policy: ContainerPolicy):
        response = self.client.api.create_container(**policy.create_kwargs())
        if not isinstance(response, dict):
            raise RuntimeError("Docker create response is malformed")
        container_id = response.get("Id")
        if type(container_id) is not str or not container_id:
            raise RuntimeError("Docker create response has no container id")
        return self.client.containers.get(container_id)

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
        policy = self._container_policy(
            role="secret-initializer",
            run_id=run_id,
            image=worker_image,
            token_digest=token_digest,
        )
        if (
            getattr(initializer, "name", None) != policy.name
            or actual_image != worker_image
            or labels != policy.fixed_config["Labels"]
            or self._container_state(initializer) != "created"
        ):
            raise ContainerConflict("Secret initializer identity conflicts")
        mountpoints = self._volume_mountpoints(run_id, kinds=("secret",))
        self._validate_fixed_policy(
            initializer,
            policy=policy,
            volume_mountpoints=mountpoints,
        )

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
    def _validate_volume(
        volume: object,
        *,
        run_id: UUID,
        kind: Literal["data", "secret"],
    ) -> str:
        attrs = getattr(volume, "attrs", None)
        if not isinstance(attrs, dict):
            raise VolumeConflict("Docker volume ownership labels conflict")
        name = data_volume_name(run_id) if kind == "data" else secret_volume_name(run_id)
        expected = {RUN_ID_LABEL: str(run_id), KIND_LABEL: kind}
        required_fields = {"Driver", "Labels", "Mountpoint", "Name", "Options", "Scope"}
        if not required_fields <= set(attrs):
            raise VolumeConflict("Docker volume ownership labels conflict")
        options = attrs["Options"]
        mountpoint = attrs["Mountpoint"]
        if (
            getattr(volume, "name", None) != name
            or attrs["Name"] != name
            or attrs["Labels"] != expected
            or attrs["Driver"] != "local"
            or attrs["Scope"] != "local"
            or options not in (None, {})
            or type(mountpoint) is not str
            or not mountpoint.startswith("/")
            or not mountpoint.endswith("/volumes/" + name + "/_data")
        ):
            raise VolumeConflict("Docker volume policy conflicts")
        return mountpoint

    def _volume_mountpoints(
        self,
        run_id: UUID,
        *,
        kinds: tuple[Literal["data", "secret"], ...],
    ) -> dict[str, str]:
        mountpoints: dict[str, str] = {}
        for kind in kinds:
            name = data_volume_name(run_id) if kind == "data" else secret_volume_name(run_id)
            try:
                volume = self.client.volumes.get(name)
            except Exception as error:
                if _is_not_found(error):
                    raise VolumeConflict("Required Docker volume is missing") from error
                raise
            mountpoints[name] = self._validate_volume(
                volume,
                run_id=run_id,
                kind=kind,
            )
        return mountpoints

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
        policy = self._container_policy(
            role="worker",
            run_id=run_id,
            image=self._required_field(config, "Image"),
            token_digest=token_digest,
        )
        mountpoints = self._volume_mountpoints(run_id, kinds=("data", "secret"))
        self._validate_fixed_policy(
            worker,
            policy=policy,
            volume_mountpoints=mountpoints,
        )
        return labels

    def _validate_fixed_policy(
        self,
        container: object,
        *,
        policy: ContainerPolicy,
        volume_mountpoints: dict[str, str],
    ) -> None:
        attrs = self._inspect_attrs(container)
        config = self._required_mapping(attrs, "Config")
        host_config = self._required_mapping(attrs, "HostConfig")
        network_settings = self._required_mapping(attrs, "NetworkSettings")
        networks = self._required_field(network_settings, "Networks")
        ports = self._required_field(network_settings, "Ports")
        mounts = self._required_field(attrs, "Mounts")
        image_config = self._image_config(container)
        if not self._config_policy_matches(
            config,
            image_config=image_config,
            policy=policy,
        ):
            raise ContainerConflict("Container Docker policy conflicts")
        allowed_host_fields = set(policy.host_config) | set(policy.optional_host_config)
        if set(host_config) - allowed_host_fields:
            raise ContainerConflict("Container Docker policy conflicts")
        for field, expected in policy.host_config.items():
            actual = self._required_field(host_config, field)
            if not self._host_policy_value_matches(field, actual, expected):
                raise ContainerConflict("Container Docker policy conflicts")
        for field, expected in policy.optional_host_config.items():
            if field in host_config and not self._host_policy_value_matches(
                field, host_config[field], expected
            ):
                raise ContainerConflict("Container Docker policy conflicts")
        if (
            not self._no_effective_port_mappings(ports)
            or not isinstance(networks, dict)
            or set(networks) != {policy.network}
            or not self._network_endpoint_matches(
                networks[policy.network],
                container=container,
                policy=policy,
            )
            or not self._mounts_match(
                mounts,
                policy.mounts,
                volume_mountpoints=volume_mountpoints,
            )
        ):
            raise ContainerConflict("Container Docker policy conflicts")

    def _config_policy_matches(
        self,
        config: dict[str, object],
        *,
        image_config: dict[str, object],
        policy: ContainerPolicy,
    ) -> bool:
        optional_config_fields = set(policy.optional_config_fields)
        for field in IMAGE_INHERITED_CONFIG_FIELDS:
            if self._image_config_field(image_config, field) is None:
                optional_config_fields.add(field)
        required_config_fields = policy.config_fields - optional_config_fields
        if (
            not required_config_fields <= set(config)
            or set(config) - policy.config_fields
        ):
            return False
        for field, expected in policy.fixed_config.items():
            if field not in config and field in optional_config_fields:
                continue
            actual = self._required_field(config, field)
            if not self._exact_value_matches(actual, expected):
                return False
        for field in ("Cmd", "Entrypoint", "Shell"):
            expected = self._image_config_field(image_config, field)
            if field not in config and field in optional_config_fields:
                continue
            actual = self._required_field(config, field)
            if (
                not self._string_list_or_none(actual)
                or not self._string_list_or_none(expected)
                or not self._exact_value_matches(actual, expected)
            ):
                return False
        for field in ("ExposedPorts", "Volumes"):
            expected = self._image_config_field(image_config, field)
            if field not in config and field in optional_config_fields:
                continue
            actual = self._required_field(config, field)
            if (
                not self._empty_object_map_or_none(actual)
                or not self._empty_object_map_or_none(expected)
                or not self._exact_value_matches(actual, expected)
            ):
                return False
        expected_healthcheck = self._image_config_field(image_config, "Healthcheck")
        if "Healthcheck" not in config and "Healthcheck" in optional_config_fields:
            actual_healthcheck = None
        else:
            actual_healthcheck = self._required_field(config, "Healthcheck")
        if (
            not self._canonical_healthcheck(actual_healthcheck)
            or not self._canonical_healthcheck(expected_healthcheck)
            or not self._exact_value_matches(actual_healthcheck, expected_healthcheck)
        ):
            return False
        actual_environment = self._required_field(config, "Env")
        actual = (
            {} if actual_environment is None else self._environment_map(actual_environment)
        )
        image_environment = self._required_field(image_config, "Env")
        expected = (
            {} if image_environment is None else self._environment_map(image_environment)
        )
        if actual is None or expected is None:
            return False
        expected.update(policy.environment_overrides)
        return actual == expected

    @classmethod
    def _host_policy_value_matches(
        cls,
        field: str,
        actual: object,
        expected: object,
    ) -> bool:
        if field in SAFE_EMPTY_SEQUENCE_FIELDS:
            return actual is None or actual == []
        if field in SAFE_EMPTY_MAPPING_FIELDS:
            return actual is None or actual == {}
        if field == "Annotations":
            return actual is None or actual == {}
        if field == "Mounts":
            return actual is None or actual == []
        if field in OPTIONAL_HOST_CONFIG:
            return cls._exact_value_matches(actual, expected)
        if field in {"Binds", "CapDrop", "MaskedPaths", "ReadonlyPaths"}:
            return cls._string_list_matches(actual, expected)
        if field == "SecurityOpt":
            return cls._no_new_privileges_only(actual)
        return cls._exact_value_matches(actual, expected)

    @classmethod
    def _exact_value_matches(cls, actual: object, expected: object) -> bool:
        if type(actual) is not type(expected):
            return False
        if isinstance(expected, dict):
            return set(actual) == set(expected) and all(
                cls._exact_value_matches(actual[key], value)
                for key, value in expected.items()
            )
        if isinstance(expected, list):
            return len(actual) == len(expected) and all(
                cls._exact_value_matches(actual_item, expected_item)
                for actual_item, expected_item in zip(actual, expected, strict=True)
            )
        return actual == expected

    def _container_policy(
        self,
        *,
        role: Literal["worker", "secret-initializer"],
        run_id: UUID,
        image: str,
        token_digest: str,
    ) -> ContainerPolicy:
        docker_api_version = self._docker_api_version()
        return build_container_policy(
            role=role,
            run_id=run_id,
            image=image,
            token_digest=token_digest,
            backend_internal_url=self.settings.backend_internal_url,
            worker_network=self.settings.worker_network,
            docker_api_version=docker_api_version,
        )

    def _docker_api_version(self) -> tuple[int, int]:
        api = getattr(self.client, "api", None)
        version = getattr(api, "_version", None)
        if type(version) is not str:
            raise ContainerConflict("Docker API version is unavailable")
        parts = version.split(".")
        if len(parts) != 2 or any(not part.isdigit() for part in parts):
            raise ContainerConflict("Docker API version is malformed")
        return int(parts[0]), int(parts[1])

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
    def _image_config_field(image_config: dict[str, object], field: str) -> object:
        if field in image_config:
            return image_config[field]
        if field in OPTIONAL_IMAGE_CONFIG_FIELDS:
            return None
        raise ContainerConflict("Container image inspect data is incomplete")

    @staticmethod
    def _string_list_matches(actual: object, expected: list[str]) -> bool:
        return (
            isinstance(actual, list)
            and len(actual) == len(expected)
            and all(type(item) is str for item in actual)
            and sorted(actual) == sorted(expected)
        )

    @staticmethod
    def _no_effective_port_mappings(value: object) -> bool:
        if not isinstance(value, dict):
            return False
        return all(
            type(port) is str
            and bool(port)
            and (bindings is None or bindings == [])
            for port, bindings in value.items()
        )

    @staticmethod
    def _no_new_privileges_only(value: object) -> bool:
        return isinstance(value, list) and value in (
            ["no-new-privileges"],
            ["no-new-privileges:true"],
        )

    @classmethod
    def _network_endpoint_matches(
        cls,
        endpoint: object,
        *,
        container: object,
        policy: ContainerPolicy,
    ) -> bool:
        if not isinstance(endpoint, dict):
            return False
        allowed_fields = CALLER_ENDPOINT_FIELDS | DAEMON_ENDPOINT_FIELDS
        if not policy.required_endpoint_fields <= set(endpoint) or set(
            endpoint
        ) - allowed_fields:
            return False
        if endpoint["IPAMConfig"] not in (None, {}) or endpoint["DriverOpts"] not in (
            None,
            {},
        ):
            return False
        if endpoint["Links"] not in (None, []):
            return False
        if "GwPriority" in endpoint and (
            type(endpoint["GwPriority"]) is not int or endpoint["GwPriority"] != 0
        ):
            return False

        container_id = getattr(container, "id", None)
        safe_dns_names = {policy.name, policy.fixed_config["Hostname"]}
        if type(container_id) is str and container_id:
            safe_dns_names.update({container_id, container_id[:12]})
        for field in ("Aliases", "DNSNames"):
            if field not in endpoint:
                continue
            value = endpoint[field]
            if value is None:
                continue
            if (
                not isinstance(value, list)
                or any(type(item) is not str or item not in safe_dns_names for item in value)
            ):
                return False

        string_fields = ("EndpointID", "NetworkID")
        if any(
            field in endpoint and type(endpoint[field]) is not str
            for field in string_fields
        ):
            return False
        if "MacAddress" in endpoint:
            mac_address = endpoint["MacAddress"]
            if type(mac_address) is not str or (
                mac_address and MAC_ADDRESS_PATTERN.fullmatch(mac_address) is None
            ):
                return False
        address_fields = (
            ("Gateway", 4),
            ("IPAddress", 4),
            ("IPv6Gateway", 6),
            ("GlobalIPv6Address", 6),
        )
        for field, version in address_fields:
            if field in endpoint and not cls._ip_address_or_empty(
                endpoint[field], version=version
            ):
                return False
        prefix_fields = (("IPPrefixLen", 32), ("GlobalIPv6PrefixLen", 128))
        return all(
            field not in endpoint
            or (
                type(endpoint[field]) is int
                and 0 <= endpoint[field] <= maximum
            )
            for field, maximum in prefix_fields
        )

    @staticmethod
    def _ip_address_or_empty(value: object, *, version: int) -> bool:
        if type(value) is not str:
            return False
        if not value:
            return True
        try:
            return ipaddress.ip_address(value).version == version
        except ValueError:
            return False

    @staticmethod
    def _mounts_match(
        actual: object,
        expected: list[tuple[str, str, str, str, bool]],
        *,
        volume_mountpoints: dict[str, str],
    ) -> bool:
        if not isinstance(actual, list) or len(actual) != len(expected):
            return False
        normalized = []
        for mount in actual:
            if not isinstance(mount, dict):
                return False
            fields = {
                "Destination",
                "Driver",
                "Mode",
                "Name",
                "Propagation",
                "RW",
                "Source",
                "Type",
            }
            if set(mount) != fields:
                return False
            source = mount["Source"]
            name = mount["Name"]
            if (
                type(source) is not str
                or type(name) is not str
                or name not in volume_mountpoints
                or source != volume_mountpoints[name]
                or type(mount["Driver"]) is not str
                or mount["Driver"] != "local"
                or type(mount["Propagation"]) is not str
                or mount["Propagation"] != ""
                or type(mount["RW"]) is not bool
            ):
                return False
            normalized.append(
                tuple(
                    mount[field]
                    for field in ("Type", "Name", "Destination", "Mode", "RW")
                )
            )
        return sorted(normalized, key=repr) == sorted(expected, key=repr)

    @staticmethod
    def _string_list_or_none(value: object) -> bool:
        return value is None or (
            isinstance(value, list) and all(type(item) is str for item in value)
        )

    @staticmethod
    def _empty_object_map_or_none(value: object) -> bool:
        if value is None:
            return True
        return isinstance(value, dict) and all(
            type(key) is str and bool(key) and item == {}
            for key, item in value.items()
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
            or (
                test != ["NONE"]
                and not (
                    len(test) == 2
                    and test[0] == "CMD-SHELL"
                    and type(test[1]) is str
                    and bool(test[1])
                )
            )
        ):
            return False
        if "Retries" in value:
            retries = value["Retries"]
            if type(retries) is not int or retries < 0:
                return False
        duration_fields = ("Interval", "Timeout", "StartPeriod", "StartInterval")
        for field in duration_fields:
            if field not in value:
                continue
            duration = value[field]
            if type(duration) is not int or (duration != 0 and duration < 1_000_000):
                return False
        return True

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
