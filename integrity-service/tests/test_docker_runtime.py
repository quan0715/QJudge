from __future__ import annotations

import hashlib
import io
import json
import tarfile
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest

from integrity_service.controller.docker_runtime import (
    ContainerConflict,
    ContainerNotStopped,
    DockerRuntime,
    ImageNotAllowed,
    VolumeConflict,
    build_container_policy,
    container_name,
    data_volume_name,
    secret_initializer_name,
    secret_volume_name,
)
from integrity_service.controller.settings import ControllerSettings
from integrity_service.worker.settings import WorkerSettings


RUN_ID = UUID("11111111-1111-1111-1111-111111111111")
WORKER_IMAGE = "oj-integrity-worker:latest"
IMAGE_DIGEST = "sha256:" + "a" * 64
RUN_TOKEN = "secret"
RUN_TOKEN_SHA256 = hashlib.sha256(RUN_TOKEN.encode("utf-8")).hexdigest()
IMAGE_ENVIRONMENT = ["PATH=/usr/local/bin"]
IMAGE_COMMAND = [
    "uvicorn",
    "integrity_service.worker.app:app",
    "--host",
    "0.0.0.0",
    "--port",
    "8020",
]
IMAGE_ENTRYPOINT = None
IMAGE_HEALTHCHECK = None
HEALTHCHECK_DURATION_FIELDS = ("Interval", "Timeout", "StartPeriod", "StartInterval")
MALFORMED_HEALTHCHECKS = [
    pytest.param({}, id="empty-healthcheck"),
    pytest.param({"Test": None}, id="null-test"),
    pytest.param({"Test": "NONE"}, id="non-list-test"),
    pytest.param({"Test": []}, id="empty-test"),
    pytest.param({"Test": ("NONE",)}, id="tuple-test"),
    pytest.param({"Test": ["UNKNOWN"]}, id="unknown-form"),
    pytest.param({"Test": ["CMD", "true"]}, id="cmd-form"),
    pytest.param({"Test": ["NONE", "unexpected"]}, id="none-extra-element"),
    pytest.param({"Test": ["CMD-SHELL"]}, id="cmd-shell-missing-command"),
    pytest.param(
        {"Test": ["CMD-SHELL", "true", "unexpected"]},
        id="cmd-shell-extra-element",
    ),
    pytest.param({"Test": ["CMD-SHELL", 1]}, id="cmd-shell-non-string-command"),
    pytest.param({"Test": ["CMD-SHELL", ""]}, id="cmd-shell-empty-command"),
    pytest.param(
        {"Test": ["CMD-SHELL", "true"], "Unexpected": 0},
        id="unexpected-field",
    ),
    *[
        pytest.param(
            {"Test": ["CMD-SHELL", "true"], field: invalid_value},
            id=f"invalid-{field.lower()}-{value_id}",
        )
        for field in HEALTHCHECK_DURATION_FIELDS
        for value_id, invalid_value in (
            ("negative", -1),
            ("positive-sub-ms", 1),
            ("boundary-sub-ms", 999_999),
            ("boolean", True),
            ("float", 1_000_000.0),
            ("string", "1000000"),
            ("null", None),
        )
    ],
    *[
        pytest.param(
            {"Test": ["CMD-SHELL", "true"], "Retries": invalid_value},
            id=f"invalid-retries-{value_id}",
        )
        for value_id, invalid_value in (
            ("negative", -1),
            ("boolean", True),
            ("float", 0.0),
            ("string", "0"),
            ("null", None),
        )
    ],
]
SAFE_EFFECTIVE_PORTS = [
    pytest.param({}, id="empty"),
    pytest.param({"8020/tcp": None}, id="exposed-unbound-null"),
    pytest.param({"8020/tcp": []}, id="exposed-unbound-empty-list"),
    pytest.param(
        {"8020/tcp": None, "8020/udp": []},
        id="multiple-exposed-unbound",
    ),
]
UNSAFE_EFFECTIVE_PORTS = [
    pytest.param(None, id="null"),
    pytest.param([], id="list"),
    pytest.param("", id="string"),
    pytest.param({"": None}, id="empty-port-key"),
    pytest.param({8020: None}, id="non-string-port-key"),
    pytest.param({"8020/tcp": {}}, id="mapping-object"),
    pytest.param({"8020/tcp": "32768"}, id="mapping-string"),
    pytest.param({"8020/tcp": [None]}, id="nonempty-null-binding"),
    pytest.param(
        {"8020/tcp": [{"HostIp": "0.0.0.0", "HostPort": "32768"}]},
        id="nonempty-host-binding",
    ),
]
NON_FALSE_PUBLISH_ALL_PORTS = [
    pytest.param(True, id="true"),
    pytest.param(None, id="null"),
    pytest.param(0, id="integer-zero"),
    pytest.param("false", id="string-false"),
    pytest.param([], id="empty-list"),
]

# These lists are deliberately independent from the production policy builder.
# If an attestation key is accidentally removed or reclassified there, the
# matrices below must fail instead of silently shrinking with it.
REQUIRED_CLOSED_WORLD_CONFIG_FIELDS = frozenset(
    {
        "AttachStderr",
        "AttachStdin",
        "AttachStdout",
        "ArgsEscaped",
        "Cmd",
        "Domainname",
        "Entrypoint",
        "Env",
        "ExposedPorts",
        "Healthcheck",
        "Hostname",
        "Image",
        "Labels",
        "MacAddress",
        "NetworkDisabled",
        "OnBuild",
        "OpenStdin",
        "Shell",
        "StdinOnce",
        "StopSignal",
        "StopTimeout",
        "Tty",
        "User",
        "Volumes",
        "WorkingDir",
    }
)
OPTIONAL_ENGINE_CONFIG_FIELDS = frozenset({"ArgsEscaped", "MacAddress", "OnBuild"})
OPTIONAL_IMAGE_CONFIG_FIELDS = frozenset(
    {"Entrypoint", "Healthcheck", "Shell", "Volumes"}
)
CLOSED_WORLD_HOST_CONFIG_FIELDS = frozenset(
    {
        "AutoRemove",
        "Binds",
        "BlkioDeviceReadBps",
        "BlkioDeviceReadIOps",
        "BlkioDeviceWriteBps",
        "BlkioDeviceWriteIOps",
        "BlkioWeight",
        "BlkioWeightDevice",
        "CpuRealtimePeriod",
        "CpuRealtimeRuntime",
        "CapAdd",
        "CapDrop",
        "Cgroup",
        "CgroupParent",
        "CgroupnsMode",
        "CpuCount",
        "CpuPercent",
        "CpuPeriod",
        "CpuQuota",
        "CpuShares",
        "CpusetCpus",
        "CpusetMems",
        "ContainerIDFile",
        "ConsoleSize",
        "DeviceCgroupRules",
        "DeviceRequests",
        "Devices",
        "Dns",
        "DnsOptions",
        "DnsSearch",
        "ExtraHosts",
        "GroupAdd",
        "Init",
        "IOMaximumBandwidth",
        "IOMaximumIOps",
        "IpcMode",
        "Isolation",
        "KernelMemory",
        "Links",
        "LogConfig",
        "LxcConf",
        "MaskedPaths",
        "Memory",
        "MemoryReservation",
        "MemorySwap",
        "MemorySwappiness",
        "NanoCpus",
        "NetworkMode",
        "OomKillDisable",
        "OomScoreAdj",
        "PidMode",
        "PidsLimit",
        "PortBindings",
        "Privileged",
        "PublishAllPorts",
        "ReadonlyPaths",
        "ReadonlyRootfs",
        "RestartPolicy",
        "Runtime",
        "SecurityOpt",
        "ShmSize",
        "StorageOpt",
        "Sysctls",
        "Tmpfs",
        "UTSMode",
        "Ulimits",
        "UsernsMode",
        "VolumeDriver",
        "VolumesFrom",
    }
)
REQUIRED_CLOSED_WORLD_HOST_CONFIG_FIELDS = frozenset(
    {
        "AutoRemove",
        "Binds",
        "BlkioDeviceReadBps",
        "BlkioDeviceReadIOps",
        "BlkioDeviceWriteBps",
        "BlkioDeviceWriteIOps",
        "BlkioWeight",
        "BlkioWeightDevice",
        "CpuRealtimePeriod",
        "CpuRealtimeRuntime",
        "CapAdd",
        "CapDrop",
        "Cgroup",
        "CgroupParent",
        "CgroupnsMode",
        "CpuCount",
        "CpuPercent",
        "CpuPeriod",
        "CpuQuota",
        "CpuShares",
        "CpusetCpus",
        "CpusetMems",
        "ContainerIDFile",
        "ConsoleSize",
        "DeviceCgroupRules",
        "DeviceRequests",
        "Devices",
        "Dns",
        "DnsOptions",
        "DnsSearch",
        "ExtraHosts",
        "GroupAdd",
        "Init",
        "IOMaximumBandwidth",
        "IOMaximumIOps",
        "IpcMode",
        "Isolation",
        "Links",
        "LogConfig",
        "MaskedPaths",
        "Memory",
        "MemoryReservation",
        "MemorySwap",
        "MemorySwappiness",
        "NanoCpus",
        "NetworkMode",
        "OomKillDisable",
        "OomScoreAdj",
        "PidMode",
        "PidsLimit",
        "PortBindings",
        "Privileged",
        "PublishAllPorts",
        "ReadonlyPaths",
        "ReadonlyRootfs",
        "RestartPolicy",
        "Runtime",
        "SecurityOpt",
        "ShmSize",
        "Tmpfs",
        "UTSMode",
        "Ulimits",
        "UsernsMode",
        "VolumeDriver",
        "VolumesFrom",
    }
)
OPTIONAL_ENGINE_HOST_CONFIG_FIELDS = frozenset(
    {
        "Annotations",
        "KernelMemory",
        "KernelMemoryTCP",
        "LxcConf",
        "Mounts",
        "StorageOpt",
        "Sysctls",
    }
)
REQUIRED_CREATE_KWARGS = frozenset(
    {
        "command",
        "detach",
        "domainname",
        "entrypoint",
        "environment",
        "healthcheck",
        "host_config",
        "hostname",
        "image",
        "labels",
        "name",
        "network_disabled",
        "networking_config",
        "stdin_open",
        "stop_signal",
        "stop_timeout",
        "tty",
        "use_config_proxy",
        "user",
        "working_dir",
    }
)
CLOSED_WORLD_CONFIG_MUTATIONS = {
    "AttachStderr": True,
    "AttachStdin": True,
    "AttachStdout": True,
    "ArgsEscaped": True,
    "Cmd": ["sh"],
    "Domainname": "attacker.invalid",
    "Entrypoint": ["/attacker-entrypoint"],
    "Env": ["ATTACKER_CONTROLLED=true"],
    "ExposedPorts": {"22/tcp": {}},
    "Healthcheck": {"Test": ["CMD", "true"]},
    "Hostname": "attacker",
    "Image": "attacker/image:latest",
    "Labels": {},
    "MacAddress": "02:42:ac:11:00:99",
    "NetworkDisabled": None,
    "OnBuild": ["RUN id"],
    "OpenStdin": True,
    "Shell": ["/bin/sh", "-c"],
    "StdinOnce": True,
    "StopSignal": "SIGKILL",
    "StopTimeout": -1,
    "Tty": True,
    "User": "0:0",
    "Volumes": {"/host": {}},
    "WorkingDir": "/host",
}
CLOSED_WORLD_HOST_CONFIG_MUTATIONS = {
    "AutoRemove": True,
    "Binds": ["/:/host:rw"],
    "BlkioDeviceReadBps": [{"Path": "/dev/sda", "Rate": 1}],
    "BlkioDeviceReadIOps": [{"Path": "/dev/sda", "Rate": 1}],
    "BlkioDeviceWriteBps": [{"Path": "/dev/sda", "Rate": 1}],
    "BlkioDeviceWriteIOps": [{"Path": "/dev/sda", "Rate": 1}],
    "BlkioWeight": 1000,
    "BlkioWeightDevice": [{"Path": "/dev/sda", "Weight": 1000}],
    "CpuRealtimePeriod": 100_000,
    "CpuRealtimeRuntime": 95_000,
    "CapAdd": ["SYS_ADMIN"],
    "CapDrop": [],
    "Cgroup": "attacker",
    "CgroupParent": "/attacker",
    "CgroupnsMode": "host",
    "CpuCount": 8,
    "CpuPercent": 100,
    "CpuPeriod": 100_000,
    "CpuQuota": -1,
    "CpuShares": 1024,
    "CpusetCpus": "0-7",
    "CpusetMems": "0",
    "ContainerIDFile": "/tmp/attacker.cid",
    "ConsoleSize": [80, 24],
    "DeviceCgroupRules": ["c 1:3 rwm"],
    "DeviceRequests": [{"Capabilities": [["gpu"]]}],
    "Devices": [{"PathOnHost": "/dev/kvm"}],
    "Dns": ["203.0.113.53"],
    "DnsOptions": ["use-vc"],
    "DnsSearch": ["attacker.invalid"],
    "ExtraHosts": ["backend:203.0.113.1"],
    "GroupAdd": ["0"],
    "Init": True,
    "IOMaximumBandwidth": 1,
    "IOMaximumIOps": 1,
    "IpcMode": "host",
    "Isolation": "hyperv",
    "KernelMemory": 64 * 1024 * 1024,
    "Links": ["attacker:backend"],
    "LogConfig": {"Type": "syslog", "Config": {}},
    "LxcConf": [{"Key": "lxc.apparmor.profile", "Value": "unconfined"}],
    "MaskedPaths": [],
    "Memory": 1024 * 1024 * 1024,
    "MemoryReservation": 1024 * 1024,
    "MemorySwap": -1,
    "MemorySwappiness": 100,
    "NanoCpus": 1_000_000_000,
    "NetworkMode": "host",
    "OomKillDisable": True,
    "OomScoreAdj": -1000,
    "PidMode": "host",
    "PidsLimit": -1,
    "PortBindings": {"8020/tcp": [{"HostPort": "8020"}]},
    "Privileged": True,
    "PublishAllPorts": True,
    "ReadonlyPaths": [],
    "ReadonlyRootfs": False,
    "RestartPolicy": {"Name": "always", "MaximumRetryCount": 0},
    "Runtime": "nvidia",
    "SecurityOpt": [],
    "ShmSize": 1024 * 1024 * 1024,
    "StorageOpt": {"size": "10G"},
    "Sysctls": {"net.ipv4.ip_forward": "1"},
    "Tmpfs": {"/tmp": "rw,exec"},
    "UTSMode": "host",
    "Ulimits": [{"Name": "nofile", "Soft": 1_000_000, "Hard": 1_000_000}],
    "UsernsMode": "host",
    "VolumeDriver": "attacker",
    "VolumesFrom": ["attacker:rw"],
}
ENDPOINT_POLICY_MUTATIONS = {
    "IPAMConfig": {"IPv4Address": "172.17.0.99"},
    "Links": ["attacker:backend"],
    "Aliases": ["backend"],
    "DriverOpts": {"com.docker.network.endpoint.sysctls": "net.ipv4.ip_forward=1"},
    "GwPriority": 1,
    "DNSNames": ["backend"],
}
OPTIONAL_HOST_CONFIG_MUTATIONS = {
    "Annotations": {"attacker": "true"},
    "KernelMemoryTCP": 1024,
    "Mounts": [{"Type": "bind", "Source": "/", "Target": "/host"}],
}


def _environment(run_id: UUID = RUN_ID) -> list[str]:
    return IMAGE_ENVIRONMENT + [
        "INTEGRITY_RUN_ID=" + str(run_id),
        "BACKEND_INTERNAL_URL=http://backend:8000",
        "RUN_TOKEN_FILE=/run-secrets/token",
        "RUN_DATA_DIR=/run-data",
    ]


def _independent_host_config(*, role: str, run_id: UUID) -> dict[str, object]:
    """Model Engine inspect output without consulting the production policy."""

    common: dict[str, object] = {
        "AutoRemove": False,
        "BlkioDeviceReadBps": [],
        "BlkioDeviceReadIOps": [],
        "BlkioDeviceWriteBps": [],
        "BlkioDeviceWriteIOps": [],
        "BlkioWeight": 0,
        "BlkioWeightDevice": [],
        "CpuRealtimePeriod": 0,
        "CpuRealtimeRuntime": 0,
        "CapAdd": None,
        "CapDrop": ["ALL"],
        "Cgroup": "",
        "CgroupParent": "",
        "CgroupnsMode": "private",
        "ContainerIDFile": "",
        "ConsoleSize": [0, 0],
        "CpuCount": 0,
        "CpuPercent": 0,
        "CpuPeriod": 0,
        "CpuQuota": 0,
        "CpuShares": 0,
        "CpusetCpus": "",
        "CpusetMems": "",
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
        "MaskedPaths": [
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
        ],
        "MemoryReservation": 0,
        "MemorySwappiness": 0,
        "OomKillDisable": False,
        "OomScoreAdj": 0,
        "PidMode": "",
        "PortBindings": {},
        "Privileged": False,
        "PublishAllPorts": False,
        "ReadonlyPaths": [
            "/proc/bus",
            "/proc/fs",
            "/proc/irq",
            "/proc/sys",
            "/proc/sysrq-trigger",
        ],
        "ReadonlyRootfs": True,
        "Runtime": "runc",
        "SecurityOpt": ["no-new-privileges"],
        "ShmSize": 64 * 1024 * 1024,
        "StorageOpt": {},
        "Sysctls": {},
        "UTSMode": "",
        "Ulimits": [],
        "UsernsMode": "",
        "VolumeDriver": "",
        "VolumesFrom": [],
        "Annotations": None,
        "KernelMemoryTCP": 0,
        "Mounts": [],
    }
    if role == "secret-initializer":
        role_specific = {
            "Binds": [
                data_volume_name(run_id) + ":/run-data:rw",
                secret_volume_name(run_id) + ":/run-secrets:rw",
            ],
            "Memory": 64 * 1024 * 1024,
            "MemorySwap": 64 * 1024 * 1024,
            "NanoCpus": 100_000_000,
            "NetworkMode": "none",
            "PidsLimit": 16,
            "RestartPolicy": {"Name": "no", "MaximumRetryCount": 0},
            "Tmpfs": {"/tmp": "rw,noexec,nosuid,size=16m"},
        }
    else:
        role_specific = {
            "Binds": [
                data_volume_name(run_id) + ":/run-data:rw",
                secret_volume_name(run_id) + ":/run-secrets:ro",
            ],
            "Memory": 512 * 1024 * 1024,
            "MemorySwap": 512 * 1024 * 1024,
            "NanoCpus": 500_000_000,
            "NetworkMode": "qjudge-test-network",
            "PidsLimit": 128,
            "RestartPolicy": {
                "Name": "unless-stopped",
                "MaximumRetryCount": 0,
            },
            "Tmpfs": {"/tmp": "rw,noexec,nosuid,size=64m"},
        }
    return {**common, **role_specific}


class DockerNotFound(Exception):
    status_code = 404


def _volume(name: str, *, kind: str) -> Mock:
    volume = Mock()
    volume.name = name
    volume.attrs = {
        "Driver": "local",
        "Labels": {
            "qjudge.integrity.run_id": str(RUN_ID),
            "qjudge.integrity.kind": kind,
        },
        "Mountpoint": f"/var/lib/docker/volumes/{name}/_data",
        "Name": name,
        "Options": None,
        "Scope": "local",
    }
    return volume


def _container(
    *,
    run_id: UUID = RUN_ID,
    image: str = WORKER_IMAGE,
    token_digest: str = RUN_TOKEN_SHA256,
    status: str = "running",
    name: str | None = None,
    role: str = "worker",
) -> Mock:
    worker = Mock()
    worker.id = "container-id"
    worker.name = name or container_name(RUN_ID)
    worker.status = status
    worker.image.id = IMAGE_DIGEST
    image_config = {
        "ExposedPorts": {"8020/tcp": {}},
        "Env": IMAGE_ENVIRONMENT,
        "Cmd": IMAGE_COMMAND,
        "Entrypoint": IMAGE_ENTRYPOINT,
        "Healthcheck": IMAGE_HEALTHCHECK,
        "Shell": None,
        "Volumes": None,
    }
    worker.image.attrs = {"Config": image_config}
    policy = build_container_policy(
        role=role,
        run_id=run_id,
        image=image,
        token_digest=token_digest,
        backend_internal_url="http://backend:8000",
        worker_network="qjudge-test-network",
    )
    mounts = [
        {
            "Type": mount_type,
            "Name": mount_name,
            "Source": f"/var/lib/docker/volumes/{mount_name}/_data",
            "Destination": destination,
            "Driver": "local",
            "Mode": mode,
            "RW": read_write,
            "Propagation": "",
        }
        for mount_type, mount_name, destination, mode, read_write in policy.mounts
    ]
    config = policy.inspect_config(image_config)
    config.update(
        {
            "ArgsEscaped": False,
            "ExposedPorts": image_config["ExposedPorts"],
            "MacAddress": "",
            "OnBuild": None,
            "Shell": image_config["Shell"],
            "Volumes": image_config["Volumes"],
        }
    )
    host_config = _independent_host_config(role=role, run_id=run_id)
    endpoint = {
        "IPAMConfig": None,
        "Links": None,
        "Aliases": None,
        "DriverOpts": None,
        "GwPriority": 0,
        "MacAddress": "" if role == "secret-initializer" else "02:42:ac:11:00:02",
        "NetworkID": "network-id",
        "EndpointID": "endpoint-id",
        "Gateway": "" if role == "secret-initializer" else "172.17.0.1",
        "IPAddress": "" if role == "secret-initializer" else "172.17.0.2",
        "IPPrefixLen": 0 if role == "secret-initializer" else 16,
        "IPv6Gateway": "",
        "GlobalIPv6Address": "",
        "GlobalIPv6PrefixLen": 0,
        "DNSNames": None,
    }
    worker.attrs = {
        "Config": config,
        "HostConfig": host_config,
        "Mounts": mounts,
        "NetworkSettings": {
            "Networks": (
                {} if role == "secret-initializer" else {policy.network: endpoint}
            ),
            "Ports": {"8020/tcp": None},
        },
        "State": {"Status": status},
    }
    return worker


def _replace_nested(mapping: dict, path: tuple[str | int, ...], value: object) -> None:
    target = mapping
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value


def _delete_nested(mapping: dict, path: tuple[str | int, ...]) -> None:
    target = mapping
    for key in path[:-1]:
        target = target[key]
    del target[path[-1]]


def _make_optional_image_field_required(
    container: Mock, path: tuple[str | int, ...]
) -> None:
    required_values = {
        ("Config", "Entrypoint"): ["/worker-entrypoint"],
        ("Config", "Healthcheck"): {"Test": ["CMD-SHELL", "true"]},
    }
    if path not in required_values:
        return
    value = required_values[path]
    container.attrs["Config"][path[-1]] = value
    container.image.attrs["Config"][path[-1]] = value


def _find_only_initializer(initializer: Mock, docker_client: Mock):
    def get_container(name: str):
        if name == secret_initializer_name(RUN_ID):
            return initializer
        if name == "created-initializer-id":
            return docker_client._test_initializer
        if name == "created-worker-id":
            return docker_client._test_worker
        raise DockerNotFound

    return get_container


def _exercise_policy_target(runtime, *, target: str, operation: str) -> None:
    if target == "initializer":
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        return
    if operation == "start":
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        return
    getattr(runtime, operation)(RUN_ID)


@pytest.fixture
def settings(tmp_path):
    return ControllerSettings(
        internal_token_file=tmp_path / "controller-token",
        allowed_worker_images=frozenset({WORKER_IMAGE}),
        backend_internal_url="http://backend:8000",
        worker_network="qjudge-test-network",
    )


@pytest.fixture
def docker_client():
    client = Mock()

    volumes = {
        data_volume_name(RUN_ID): _volume(data_volume_name(RUN_ID), kind="data"),
        secret_volume_name(RUN_ID): _volume(secret_volume_name(RUN_ID), kind="secret"),
    }

    def get_volume(name):
        try:
            return volumes[name]
        except KeyError:
            raise DockerNotFound from None

    def create_volume(*, name, labels):
        volume = Mock()
        volume.name = name
        volume.attrs = {
            "Driver": "local",
            "Labels": labels,
            "Mountpoint": f"/var/lib/docker/volumes/{name}/_data",
            "Name": name,
            "Options": None,
            "Scope": "local",
        }
        volumes[name] = volume
        return volume

    client.volumes.get.side_effect = get_volume
    client.volumes.create.side_effect = create_volume
    client.api._version = "1.48"
    client._test_volumes = volumes
    client._test_worker = _container(status="created")
    client._test_initializer = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    client.images.get.return_value = client._test_worker.image
    client.api.create_container.side_effect = [
        {"Id": "created-initializer-id"},
        {"Id": "created-worker-id"},
    ]

    def get_created_container(name: str):
        if name == "created-initializer-id":
            return client._test_initializer
        if name == "created-worker-id":
            return client._test_worker
        raise DockerNotFound

    client.containers.get.side_effect = get_created_container
    return client


@pytest.fixture
def runtime(settings, docker_client):
    return DockerRuntime(client=docker_client, settings=settings)


def test_closed_world_field_contract_is_exhaustive():
    assert (
        frozenset(CLOSED_WORLD_CONFIG_MUTATIONS) == REQUIRED_CLOSED_WORLD_CONFIG_FIELDS
    )
    assert (
        frozenset(CLOSED_WORLD_HOST_CONFIG_MUTATIONS) == CLOSED_WORLD_HOST_CONFIG_FIELDS
    )
    for role in ("worker", "secret-initializer"):
        policy = build_container_policy(
            role=role,
            run_id=RUN_ID,
            image=WORKER_IMAGE,
            token_digest=RUN_TOKEN_SHA256,
            backend_internal_url="http://backend:8000",
            worker_network="qjudge-test-network",
        )
        assert policy.config_fields == REQUIRED_CLOSED_WORLD_CONFIG_FIELDS
        assert policy.optional_config_fields == (
            OPTIONAL_ENGINE_CONFIG_FIELDS
            | ({"NetworkDisabled"} if role == "worker" else set())
        )
        assert frozenset(policy.host_config) == CLOSED_WORLD_HOST_CONFIG_FIELDS
        assert policy.required_host_config_fields == (
            REQUIRED_CLOSED_WORLD_HOST_CONFIG_FIELDS
        )
        assert policy.optional_host_config_fields == OPTIONAL_ENGINE_HOST_CONFIG_FIELDS


def test_policy_builder_matches_independent_literal_security_baseline():
    common_host_config = {
        "AutoRemove": False,
        "BlkioDeviceReadBps": [],
        "BlkioDeviceReadIOps": [],
        "BlkioDeviceWriteBps": [],
        "BlkioDeviceWriteIOps": [],
        "BlkioWeight": 0,
        "BlkioWeightDevice": [],
        "CpuRealtimePeriod": 0,
        "CpuRealtimeRuntime": 0,
        "CapAdd": None,
        "CapDrop": ["ALL"],
        "Cgroup": "",
        "CgroupParent": "",
        "CgroupnsMode": "private",
        "ContainerIDFile": "",
        "ConsoleSize": [0, 0],
        "CpuCount": 0,
        "CpuPercent": 0,
        "CpuPeriod": 0,
        "CpuQuota": 0,
        "CpuShares": 0,
        "CpusetCpus": "",
        "CpusetMems": "",
        "DeviceCgroupRules": None,
        "DeviceRequests": None,
        "Devices": [],
        "Dns": [],
        "DnsOptions": [],
        "DnsSearch": [],
        "ExtraHosts": [],
        "GroupAdd": [],
        "IOMaximumBandwidth": 0,
        "IOMaximumIOps": 0,
        "Init": False,
        "IpcMode": "private",
        "Isolation": "",
        "KernelMemory": 0,
        "Links": [],
        "LogConfig": {"Type": "none", "Config": {}},
        "LxcConf": [],
        "MaskedPaths": [
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
        ],
        "MemoryReservation": 0,
        "MemorySwappiness": 0,
        "OomKillDisable": False,
        "OomScoreAdj": 0,
        "PidMode": "",
        "PortBindings": {},
        "Privileged": False,
        "PublishAllPorts": False,
        "ReadonlyPaths": [
            "/proc/bus",
            "/proc/fs",
            "/proc/irq",
            "/proc/sys",
            "/proc/sysrq-trigger",
        ],
        "ReadonlyRootfs": True,
        "Runtime": "runc",
        "SecurityOpt": ["no-new-privileges"],
        "ShmSize": 64 * 1024 * 1024,
        "StorageOpt": {},
        "Sysctls": {},
        "UTSMode": "",
        "Ulimits": [],
        "UsernsMode": "",
        "VolumeDriver": "",
        "VolumesFrom": [],
    }
    roles = {
        "worker": {
            "name": container_name(RUN_ID),
            "hostname": "integrity-worker-" + RUN_ID.hex,
            "network_disabled": False,
            "environment": {
                "INTEGRITY_RUN_ID": str(RUN_ID),
                "BACKEND_INTERNAL_URL": "http://backend:8000",
                "RUN_TOKEN_FILE": "/run-secrets/token",
                "RUN_DATA_DIR": "/run-data",
            },
            "host": {
                "Binds": [
                    data_volume_name(RUN_ID) + ":/run-data:rw",
                    secret_volume_name(RUN_ID) + ":/run-secrets:ro",
                ],
                "Memory": 512 * 1024 * 1024,
                "MemorySwap": 512 * 1024 * 1024,
                "NanoCpus": 500_000_000,
                "NetworkMode": "qjudge-test-network",
                "PidsLimit": 128,
                "RestartPolicy": {
                    "Name": "unless-stopped",
                    "MaximumRetryCount": 0,
                },
                "Tmpfs": {"/tmp": "rw,noexec,nosuid,size=64m"},
            },
        },
        "secret-initializer": {
            "name": secret_initializer_name(RUN_ID),
            "hostname": "integrity-init-" + RUN_ID.hex,
            "network_disabled": True,
            "environment": {},
            "host": {
                "Binds": [
                    data_volume_name(RUN_ID) + ":/run-data:rw",
                    secret_volume_name(RUN_ID) + ":/run-secrets:rw",
                ],
                "Memory": 64 * 1024 * 1024,
                "MemorySwap": 64 * 1024 * 1024,
                "NanoCpus": 100_000_000,
                "NetworkMode": "none",
                "PidsLimit": 16,
                "RestartPolicy": {"Name": "no", "MaximumRetryCount": 0},
                "Tmpfs": {"/tmp": "rw,noexec,nosuid,size=16m"},
            },
        },
    }

    for role, expected in roles.items():
        policy = build_container_policy(
            role=role,
            run_id=RUN_ID,
            image=WORKER_IMAGE,
            token_digest=RUN_TOKEN_SHA256,
            backend_internal_url="http://backend:8000",
            worker_network="qjudge-test-network",
        )
        assert policy.name == expected["name"]
        assert policy.environment_overrides == expected["environment"]
        assert policy.fixed_config == {
            "AttachStderr": False,
            "AttachStdin": False,
            "AttachStdout": False,
            "ArgsEscaped": False,
            "Domainname": "",
            "Hostname": expected["hostname"],
            "Image": WORKER_IMAGE,
            "Labels": {
                "qjudge.integrity.run_id": str(RUN_ID),
                "qjudge.integrity.role": role,
                "qjudge.integrity.run_token_sha256": RUN_TOKEN_SHA256,
            },
            "MacAddress": "",
            "NetworkDisabled": expected["network_disabled"],
            "OnBuild": None,
            "OpenStdin": False,
            "StdinOnce": False,
            "StopSignal": "SIGTERM",
            "StopTimeout": 30,
            "Tty": False,
            "User": "10001:10001",
            "WorkingDir": "/app",
        }
        assert policy.host_config == {**common_host_config, **expected["host"]}
        assert policy.optional_host_config == {
            "Annotations": None,
            "KernelMemoryTCP": 0,
            "Mounts": [],
        }


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    ("section", "field", "unsafe_value"),
    [
        pytest.param("Config", field, value, id="config-" + field)
        for field, value in CLOSED_WORLD_CONFIG_MUTATIONS.items()
    ]
    + [
        pytest.param("HostConfig", field, value, id="host-config-" + field)
        for field, value in CLOSED_WORLD_HOST_CONFIG_MUTATIONS.items()
    ],
)
def test_every_worker_lifecycle_rejects_every_closed_world_policy_mutation(
    runtime,
    docker_client,
    operation,
    section,
    field,
    unsafe_value,
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    worker.attrs[section][field] = unsafe_value
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target="worker", operation=operation)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    ("section", "field"),
    [
        pytest.param("Config", field, id="config-" + field)
        for field in REQUIRED_CLOSED_WORLD_CONFIG_FIELDS
        - OPTIONAL_ENGINE_CONFIG_FIELDS
        - OPTIONAL_IMAGE_CONFIG_FIELDS
        - {"NetworkDisabled"}
    ]
    + [
        pytest.param("HostConfig", field, id="host-config-" + field)
        for field in REQUIRED_CLOSED_WORLD_HOST_CONFIG_FIELDS
    ],
)
def test_every_worker_lifecycle_rejects_every_missing_closed_world_policy_field(
    runtime,
    docker_client,
    operation,
    section,
    field,
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    del worker.attrs[section][field]
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target="worker", operation=operation)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize(
    ("section", "field", "unsafe_value"),
    [
        pytest.param("Config", field, value, id="config-" + field)
        for field, value in CLOSED_WORLD_CONFIG_MUTATIONS.items()
    ]
    + [
        pytest.param("HostConfig", field, value, id="host-config-" + field)
        for field, value in CLOSED_WORLD_HOST_CONFIG_MUTATIONS.items()
    ],
)
def test_initializer_cleanup_rejects_every_closed_world_policy_mutation(
    runtime,
    docker_client,
    section,
    field,
    unsafe_value,
):
    initializer = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    initializer.attrs[section][field] = unsafe_value
    docker_client.containers.get.side_effect = _find_only_initializer(
        initializer, docker_client
    )

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target="initializer", operation="start")

    initializer.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize(
    ("section", "field"),
    [
        pytest.param("Config", field, id="config-" + field)
        for field in REQUIRED_CLOSED_WORLD_CONFIG_FIELDS
        - OPTIONAL_ENGINE_CONFIG_FIELDS
        - OPTIONAL_IMAGE_CONFIG_FIELDS
    ]
    + [
        pytest.param("HostConfig", field, id="host-config-" + field)
        for field in REQUIRED_CLOSED_WORLD_HOST_CONFIG_FIELDS
    ],
)
def test_initializer_cleanup_rejects_every_missing_closed_world_policy_field(
    runtime,
    docker_client,
    section,
    field,
):
    initializer = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    del initializer.attrs[section][field]
    docker_client.containers.get.side_effect = _find_only_initializer(
        initializer, docker_client
    )

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target="initializer", operation="start")

    initializer.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize(
    ("target", "field"),
    [
        pytest.param(target, field, id=target + "-" + field)
        for target in ("worker", "initializer")
        for field in sorted(
            OPTIONAL_ENGINE_CONFIG_FIELDS
            | OPTIONAL_IMAGE_CONFIG_FIELDS
            | {"NetworkDisabled"}
        )
        if target == "worker" or field != "NetworkDisabled"
    ],
)
def test_policy_accepts_only_safe_omitted_config_defaults(
    runtime,
    docker_client,
    target,
    field,
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    del inspected.attrs["Config"][field]
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected

    _exercise_policy_target(runtime, target=target, operation="status")

    if target == "initializer":
        inspected.remove.assert_called_once_with()


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize("field", sorted(OPTIONAL_IMAGE_CONFIG_FIELDS))
def test_policy_accepts_safe_nil_fields_omitted_from_image_and_container_inspect(
    runtime,
    docker_client,
    target,
    field,
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    del inspected.attrs["Config"][field]
    del inspected.image.attrs["Config"][field]
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected

    _exercise_policy_target(runtime, target=target, operation="status")

    if target == "initializer":
        inspected.remove.assert_called_once_with()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    ("field", "unsafe_value"),
    ENDPOINT_POLICY_MUTATIONS.items(),
)
def test_every_worker_lifecycle_rejects_endpoint_host_redirection(
    runtime,
    docker_client,
    operation,
    field,
    unsafe_value,
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    endpoint = worker.attrs["NetworkSettings"]["Networks"]["qjudge-test-network"]
    endpoint[field] = unsafe_value
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target="worker", operation=operation)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


def test_initializer_cleanup_rejects_any_network_attachment(runtime, docker_client):
    initializer = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    initializer.attrs["NetworkSettings"]["Networks"] = {"bridge": {}}
    docker_client.containers.get.side_effect = _find_only_initializer(
        initializer, docker_client
    )

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    initializer.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize("field", ENDPOINT_POLICY_MUTATIONS)
def test_endpoint_policy_requires_every_caller_controlled_field(
    runtime,
    docker_client,
    field,
):
    inspected = _container(status="running")
    endpoint = inspected.attrs["NetworkSettings"]["Networks"]
    del endpoint[next(iter(endpoint))][field]
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = inspected

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target="worker", operation="status")

    inspected.remove.assert_not_called()


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize(
    ("section", "field", "unsafe_value"),
    [
        ("Config", "UnexpectedCallerOption", True),
        ("HostConfig", "UnexpectedCallerOption", True),
    ]
    + [
        ("HostConfig", field, value)
        for field, value in OPTIONAL_HOST_CONFIG_MUTATIONS.items()
    ],
)
def test_policy_rejects_unknown_or_nonempty_optional_docker_fields(
    runtime,
    docker_client,
    target,
    section,
    field,
    unsafe_value,
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    inspected.attrs[section][field] = unsafe_value
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target=target, operation="status")

    inspected.remove.assert_not_called()


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize("field", OPTIONAL_HOST_CONFIG_MUTATIONS)
def test_policy_accepts_absent_known_engine_optional_fields(
    runtime,
    docker_client,
    target,
    field,
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    del inspected.attrs["HostConfig"][field]
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected

    _exercise_policy_target(runtime, target=target, operation="status")

    if target == "initializer":
        inspected.remove.assert_called_once_with()
    else:
        inspected.remove.assert_not_called()


@pytest.mark.parametrize(
    ("field", "safe_value"),
    [("Annotations", {}), ("Mounts", None)],
)
def test_worker_policy_accepts_semantically_empty_engine_optional_fields(
    runtime,
    docker_client,
    field,
    safe_value,
):
    worker = _container()
    worker.attrs["HostConfig"][field] = safe_value
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    status = runtime.status(RUN_ID)

    assert status.exists is True


@pytest.mark.parametrize(
    "field",
    ["CapAdd", "DeviceCgroupRules", "Dns", "DnsOptions", "DnsSearch", "ExtraHosts"],
)
def test_worker_policy_accepts_null_as_a_semantically_empty_sequence(
    runtime,
    docker_client,
    field,
):
    worker = _container()
    worker.attrs["HostConfig"][field] = None
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    status = runtime.status(RUN_ID)

    assert status.exists is True


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize(
    ("field", "unsafe_value"),
    [
        ("RW", 1),
        ("Propagation", "rshared"),
        ("Driver", "attacker"),
        ("Source", "/"),
    ],
)
def test_policy_rejects_malformed_or_unsafe_effective_mount_details(
    runtime,
    docker_client,
    target,
    field,
    unsafe_value,
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    inspected.attrs["Mounts"][0][field] = unsafe_value
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected

    with pytest.raises(ContainerConflict):
        _exercise_policy_target(runtime, target=target, operation="status")

    inspected.remove.assert_not_called()


def test_policy_masks_the_complete_cpu_tree_against_thermal_side_channels():
    policy = build_container_policy(
        role="worker",
        run_id=RUN_ID,
        image=WORKER_IMAGE,
        token_digest=RUN_TOKEN_SHA256,
        backend_internal_url="http://backend:8000",
        worker_network="qjudge-test-network",
    )

    assert "/sys/devices/system/cpu" in policy.host_config["MaskedPaths"]


def test_older_docker_api_may_omit_version_added_safe_endpoint_fields(
    runtime,
    docker_client,
):
    worker = _container()
    endpoint = worker.attrs["NetworkSettings"]["Networks"]["qjudge-test-network"]
    del endpoint["DNSNames"]
    del endpoint["GwPriority"]
    docker_client.api._version = "1.43"
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    status = runtime.status(RUN_ID)

    assert status.exists is True


@pytest.mark.parametrize(
    ("field", "unsafe_value"),
    [("DNSNames", ["backend"]), ("GwPriority", 1)],
)
def test_older_docker_api_still_rejects_hostile_version_added_endpoint_fields(
    runtime,
    docker_client,
    field,
    unsafe_value,
):
    worker = _container()
    endpoint = worker.attrs["NetworkSettings"]["Networks"]["qjudge-test-network"]
    endpoint[field] = unsafe_value
    docker_client.api._version = "1.43"
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        runtime.status(RUN_ID)


def test_controller_settings_read_the_deployment_image_allowlist(monkeypatch, tmp_path):
    monkeypatch.setenv(
        "INTEGRITY_CONTROLLER_INTERNAL_TOKEN_FILE", str(tmp_path / "token")
    )
    monkeypatch.setenv(
        "INTEGRITY_WORKER_IMAGE_ALLOWLIST",
        "registry.example/worker@sha256:aaa,registry.example/worker@sha256:bbb",
    )

    resolved = ControllerSettings.from_environment()

    assert resolved.allowed_worker_images == frozenset(
        {
            "registry.example/worker@sha256:aaa",
            "registry.example/worker@sha256:bbb",
        }
    )


def test_start_creates_isolated_non_privileged_worker(runtime, docker_client):
    result = runtime.start(
        run_id=RUN_ID,
        run_token=RUN_TOKEN,
        worker_image=WORKER_IMAGE,
    )

    kwargs = docker_client.api.create_container.call_args_list[1].kwargs
    host_config = kwargs["host_config"]
    assert kwargs["image"] == WORKER_IMAGE
    assert kwargs["name"] == container_name(RUN_ID)
    assert kwargs["environment"] == {
        "INTEGRITY_RUN_ID": str(RUN_ID),
        "BACKEND_INTERNAL_URL": "http://backend:8000",
        "RUN_TOKEN_FILE": "/run-secrets/token",
        "RUN_DATA_DIR": "/run-data",
    }
    assert host_config["Binds"] == [
        data_volume_name(RUN_ID) + ":/run-data:rw",
        secret_volume_name(RUN_ID) + ":/run-secrets:ro",
    ]
    assert host_config["Privileged"] is False
    assert host_config["ReadonlyRootfs"] is True
    assert kwargs["user"] == "10001:10001"
    assert host_config["Tmpfs"] == {"/tmp": "rw,noexec,nosuid,size=64m"}
    assert host_config["CapDrop"] == ["ALL"]
    assert host_config["SecurityOpt"] == ["no-new-privileges"]
    assert host_config["Memory"] == 512 * 1024 * 1024
    assert host_config["NanoCpus"] == 500_000_000
    assert host_config["PidsLimit"] == 128
    assert host_config["NetworkMode"] == "qjudge-test-network"
    assert host_config["PublishAllPorts"] is False
    assert host_config["RestartPolicy"] == {
        "Name": "unless-stopped",
        "MaximumRetryCount": 0,
    }
    assert kwargs["labels"] == {
        "qjudge.integrity.run_id": str(RUN_ID),
        "qjudge.integrity.role": "worker",
        "qjudge.integrity.run_token_sha256": RUN_TOKEN_SHA256,
    }
    assert result.worker_url == f"http://{container_name(RUN_ID)}:8020"
    assert result.image_digest == IMAGE_DIGEST


def test_start_accepts_labels_inherited_from_the_allowlisted_worker_image(
    runtime, docker_client
):
    image_labels = {
        "com.docker.compose.project": "online_judge",
        "com.docker.compose.service": "integrity-worker-image",
        "com.docker.compose.version": "5.1.0",
    }
    for container in (docker_client._test_initializer, docker_client._test_worker):
        container.image.attrs["Config"]["Labels"] = image_labels.copy()
        container.attrs["Config"]["Labels"] = {
            **image_labels,
            **container.attrs["Config"]["Labels"],
        }

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert result.state == "running"
    assert docker_client.api.create_container.call_args_list[0].kwargs["labels"] == {
        **image_labels,
        "qjudge.integrity.run_id": str(RUN_ID),
        "qjudge.integrity.role": "secret-initializer",
        "qjudge.integrity.run_token_sha256": RUN_TOKEN_SHA256,
    }


def test_start_accepts_docker_desktop_safe_initializer_normalization(
    runtime, docker_client
):
    initializer = docker_client._test_initializer
    host_config = initializer.attrs["HostConfig"]
    host_config["MemorySwappiness"] = None

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert result.state == "running"


def test_start_accepts_docker_desktop_unset_oom_kill_disable(runtime, docker_client):
    docker_client._test_worker.attrs["HostConfig"]["OomKillDisable"] = None

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert result.state == "running"


def test_worker_low_level_create_request_serializes_endpoint_settings_object(
    runtime,
    docker_client,
):
    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    worker_request = docker_client.api.create_container.call_args_list[1].kwargs
    serialized_request = json.loads(json.dumps(worker_request))

    assert serialized_request["networking_config"] == {
        "EndpointsConfig": {"qjudge-test-network": {}}
    }


def test_start_creates_both_roles_from_the_complete_closed_world_policy(
    runtime,
    docker_client,
):
    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    policies = [
        build_container_policy(
            role=role,
            run_id=RUN_ID,
            image=WORKER_IMAGE,
            token_digest=RUN_TOKEN_SHA256,
            backend_internal_url="http://backend:8000",
            worker_network="qjudge-test-network",
        )
        for role in ("secret-initializer", "worker")
    ]
    calls = docker_client.api.create_container.call_args_list
    assert len(calls) == len(policies)
    for call, policy in zip(calls, policies, strict=True):
        assert frozenset(call.kwargs) == REQUIRED_CREATE_KWARGS
        assert call.kwargs == policy.create_kwargs()
        assert frozenset(call.kwargs["host_config"]) == CLOSED_WORLD_HOST_CONFIG_FIELDS


def test_start_attests_new_initializer_before_writing_the_run_token(
    runtime,
    docker_client,
):
    initializer = docker_client._test_initializer
    initializer.attrs["HostConfig"]["Privileged"] = True

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    initializer.put_archive.assert_not_called()
    docker_client._test_worker.start.assert_not_called()


def test_failed_fresh_initializer_attestation_removes_it_and_retry_can_continue(
    runtime,
    docker_client,
):
    initializer = docker_client._test_initializer
    initializer.attrs["HostConfig"]["Privileged"] = True
    docker_client.api.create_container.side_effect = [
        {"Id": "created-initializer-id"},
        {"Id": "created-initializer-id"},
        {"Id": "created-worker-id"},
    ]

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    initializer.remove.assert_called_once_with()
    initializer.put_archive.assert_not_called()
    assert [
        call.kwargs["name"]
        for call in docker_client.api.create_container.call_args_list
    ] == [secret_initializer_name(RUN_ID)]
    docker_client._test_worker.start.assert_not_called()

    initializer.attrs["HostConfig"]["Privileged"] = False
    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert result.state == "running"
    assert initializer.remove.call_count == 2
    assert initializer.put_archive.call_count == 2
    assert [
        call.kwargs["name"]
        for call in docker_client.api.create_container.call_args_list
    ] == [
        secret_initializer_name(RUN_ID),
        secret_initializer_name(RUN_ID),
        container_name(RUN_ID),
    ]
    docker_client._test_worker.start.assert_called_once_with()


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize(
    "field",
    ["KernelMemory", "LxcConf", "StorageOpt", "Sysctls"],
)
def test_start_accepts_engine_normalized_fresh_inspect_safe_omissions(
    runtime,
    docker_client,
    target,
    field,
):
    inspected = (
        docker_client._test_worker
        if target == "worker"
        else docker_client._test_initializer
    )
    del inspected.attrs["HostConfig"][field]

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert result.state == "running"
    docker_client._test_initializer.remove.assert_called_once_with()
    docker_client._test_worker.start.assert_called_once_with()


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize(
    "field",
    ["KernelMemory", "LxcConf", "StorageOpt", "Sysctls"],
)
def test_start_rejects_engine_normalized_fresh_inspect_hostile_present_values(
    runtime,
    docker_client,
    target,
    field,
):
    inspected = (
        docker_client._test_worker
        if target == "worker"
        else docker_client._test_initializer
    )
    inspected.attrs["HostConfig"][field] = CLOSED_WORLD_HOST_CONFIG_MUTATIONS[field]

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    inspected.start.assert_not_called()
    inspected.put_archive.assert_not_called()
    if target == "initializer":
        inspected.remove.assert_called_once_with()
        assert [
            call.kwargs["name"]
            for call in docker_client.api.create_container.call_args_list
        ] == [secret_initializer_name(RUN_ID)]
    docker_client._test_worker.start.assert_not_called()


def test_start_attests_new_worker_before_starting_it(runtime, docker_client):
    worker = docker_client._test_worker
    worker.attrs["HostConfig"]["Privileged"] = True

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    worker.start.assert_not_called()


def test_start_creates_exactly_labelled_data_and_secret_volumes(runtime, docker_client):
    docker_client._test_volumes.clear()

    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    calls = {
        call.kwargs["name"]: call.kwargs["labels"]
        for call in docker_client.volumes.create.call_args_list
    }
    assert calls == {
        data_volume_name(RUN_ID): {
            "qjudge.integrity.run_id": str(RUN_ID),
            "qjudge.integrity.kind": "data",
        },
        secret_volume_name(RUN_ID): {
            "qjudge.integrity.run_id": str(RUN_ID),
            "qjudge.integrity.kind": "secret",
        },
    }


def test_start_populates_secret_archive_before_start(runtime, docker_client):
    initializer = docker_client._test_initializer
    worker = docker_client._test_worker

    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    destination, archive = initializer.put_archive.call_args_list[0].args
    assert destination == "/run-secrets"
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
        member = tar.getmember("token")
        assert member.uid == 10001
        assert member.gid == 10001
        assert member.mode == 0o400
        extracted = tar.extractfile(member)
        assert extracted is not None
        assert extracted.read() == RUN_TOKEN.encode("utf-8")
    assert initializer.put_archive.call_count == 2
    initializer.remove.assert_called_once_with()
    initializer.start.assert_not_called()
    worker.put_archive.assert_not_called()
    worker.start.assert_called_once_with()


def test_start_initializes_a_private_run_directory_before_start(runtime, docker_client):
    initializer = docker_client._test_initializer

    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    destination, archive = initializer.put_archive.call_args_list[1].args
    assert destination == "/run-data"
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
        member = tar.getmember(str(RUN_ID))
        assert member.isdir()
        assert member.uid == 10001
        assert member.gid == 10001
        assert member.mode == 0o700


def test_secret_initializer_is_fixed_networkless_and_mounts_run_data_and_secret_rw(
    runtime, docker_client
):
    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    initializer_kwargs = docker_client.api.create_container.call_args_list[0].kwargs
    expected = build_container_policy(
        role="secret-initializer",
        run_id=RUN_ID,
        image=WORKER_IMAGE,
        token_digest=RUN_TOKEN_SHA256,
        backend_internal_url="http://backend:8000",
        worker_network="qjudge-test-network",
    )
    assert initializer_kwargs == expected.create_kwargs()


def test_secret_initializer_is_removed_before_final_worker_starts(
    runtime, docker_client
):
    operations = []
    initializer = docker_client._test_initializer
    worker = docker_client._test_worker
    initializer.put_archive.side_effect = (
        lambda *_args: operations.append("populate") or True
    )
    initializer.remove.side_effect = lambda: operations.append("remove")
    worker.start.side_effect = lambda: operations.append("start-worker")

    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert operations == ["populate", "populate", "remove", "start-worker"]


def test_secret_initializer_is_removed_when_archive_population_fails(
    runtime, docker_client
):
    initializer = docker_client._test_initializer
    initializer.put_archive.return_value = False

    with pytest.raises(OSError, match="populate"):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    initializer.remove.assert_called_once_with()
    assert [
        call.kwargs["name"]
        for call in docker_client.api.create_container.call_args_list
    ] == [secret_initializer_name(RUN_ID)]
    docker_client._test_worker.start.assert_not_called()


def test_start_removes_a_matching_stale_initializer_before_retry(
    runtime, docker_client
):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )

    docker_client.containers.get.side_effect = _find_only_initializer(
        stale, docker_client
    )

    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_called_once_with()
    assert docker_client._test_initializer.put_archive.call_count == 2
    docker_client._test_worker.start.assert_called_once_with()


@pytest.mark.parametrize(
    ("path", "unsafe_value"),
    [
        (("Config", "Env"), IMAGE_ENVIRONMENT + ["ATTACKER_CONTROLLED=true"]),
        (("Config", "User"), "0:0"),
        (("Config", "Cmd"), ["sh"]),
        (("Config", "Entrypoint"), ["/attacker-entrypoint"]),
        (("Config", "Healthcheck"), {"Test": ["CMD", "true"]}),
        (("Config", "Labels"), {"qjudge.integrity.role": "secret-initializer"}),
        (("HostConfig", "NetworkMode"), "bridge"),
        (("HostConfig", "Binds"), ["victim:/run-secrets:rw"]),
        (("HostConfig", "PublishAllPorts"), True),
        (("HostConfig", "ReadonlyRootfs"), False),
        (("HostConfig", "CapAdd"), ["SYS_ADMIN"]),
        (("HostConfig", "CapDrop"), []),
        (("HostConfig", "Privileged"), True),
        (("HostConfig", "SecurityOpt"), []),
        (("HostConfig", "Tmpfs"), {"/tmp": "rw,exec,size=16m"}),
        (("HostConfig", "Memory"), 128 * 1024 * 1024),
        (("HostConfig", "NanoCpus"), 1_000_000_000),
        (("HostConfig", "PidsLimit"), 512),
        (
            ("HostConfig", "RestartPolicy"),
            {"Name": "always", "MaximumRetryCount": 0},
        ),
        (("HostConfig", "PortBindings"), {"8020/tcp": [{"HostPort": "8020"}]}),
        (("HostConfig", "Devices"), [{"PathOnHost": "/dev/kvm"}]),
        (("HostConfig", "DeviceRequests"), [{"Capabilities": [["gpu"]]}]),
        (("HostConfig", "PidMode"), "host"),
        (("HostConfig", "IpcMode"), "host"),
        (("State", "Status"), None),
        (
            ("Mounts",),
            [
                {
                    "Type": "bind",
                    "Name": "",
                    "Destination": "/run-secrets",
                    "Mode": "rw",
                    "RW": True,
                }
            ],
        ),
        (("NetworkSettings", "Networks"), {"none": {}, "bridge": {}}),
        (
            ("NetworkSettings", "Ports"),
            {"8020/tcp": [{"HostIp": "0.0.0.0", "HostPort": "32768"}]},
        ),
    ],
    ids=[
        "environment",
        "user",
        "command",
        "entrypoint",
        "healthcheck",
        "labels",
        "network-mode",
        "binds",
        "publish-all-ports",
        "read-only-rootfs",
        "cap-add",
        "cap-drop",
        "privileged",
        "security-options",
        "tmpfs",
        "memory",
        "cpu",
        "pids",
        "restart-policy",
        "port-bindings",
        "devices",
        "device-requests",
        "pid-mode",
        "ipc-mode",
        "malformed-state",
        "mounts",
        "network-attachments",
        "effective-port-mappings",
    ],
)
def test_start_rejects_stale_initializer_with_any_policy_mismatch(
    runtime, docker_client, path, unsafe_value
):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    _replace_nested(stale.attrs, path, unsafe_value)

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize(
    "path",
    [
        ("Config",),
        ("Config", "Image"),
        ("Config", "Env"),
        ("Config", "User"),
        ("Config", "Cmd"),
        ("Config", "Entrypoint"),
        ("Config", "Healthcheck"),
        ("Config", "Labels"),
        ("HostConfig",),
        ("HostConfig", "NetworkMode"),
        ("HostConfig", "Binds"),
        ("HostConfig", "PublishAllPorts"),
        ("HostConfig", "ReadonlyRootfs"),
        ("HostConfig", "CapAdd"),
        ("HostConfig", "CapDrop"),
        ("HostConfig", "Privileged"),
        ("HostConfig", "SecurityOpt"),
        ("HostConfig", "Tmpfs"),
        ("HostConfig", "Memory"),
        ("HostConfig", "NanoCpus"),
        ("HostConfig", "PidsLimit"),
        ("HostConfig", "RestartPolicy"),
        ("HostConfig", "PortBindings"),
        ("HostConfig", "Devices"),
        ("HostConfig", "DeviceRequests"),
        ("HostConfig", "PidMode"),
        ("HostConfig", "IpcMode"),
        ("Mounts",),
        ("Mounts", 0, "Type"),
        ("Mounts", 0, "Name"),
        ("Mounts", 0, "Source"),
        ("Mounts", 0, "Destination"),
        ("Mounts", 0, "Driver"),
        ("Mounts", 0, "Mode"),
        ("Mounts", 0, "Propagation"),
        ("Mounts", 0, "RW"),
        ("NetworkSettings",),
        ("NetworkSettings", "Networks"),
        ("NetworkSettings", "Ports"),
        ("State",),
        ("State", "Status"),
    ],
)
def test_start_rejects_stale_initializer_with_any_missing_inspect_field(
    runtime, docker_client, path
):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    _make_optional_image_field_required(stale, path)
    _delete_nested(stale.attrs, path)

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize(
    "image_path",
    [
        ("Config",),
        ("Config", "Env"),
        ("Config", "Cmd"),
        ("Config", "Entrypoint"),
        ("Config", "Healthcheck"),
    ],
)
def test_start_rejects_stale_initializer_with_missing_image_inspect_field(
    runtime, docker_client, image_path
):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    _make_optional_image_field_required(stale, image_path)
    _delete_nested(stale.image.attrs, image_path)

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize(
    ("field", "malformed_value"),
    [
        ("Env", "PATH=/usr/local/bin"),
        ("Cmd", "uvicorn"),
        ("Entrypoint", {"command": "sh"}),
        ("Healthcheck", {"Test": "CMD true"}),
    ],
)
def test_start_rejects_stale_initializer_with_malformed_matching_image_policy(
    runtime, docker_client, field, malformed_value
):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    stale.attrs["Config"][field] = malformed_value
    stale.image.attrs["Config"][field] = malformed_value

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize("healthcheck", MALFORMED_HEALTHCHECKS)
def test_start_rejects_stale_initializer_with_malformed_matching_healthcheck(
    runtime, docker_client, healthcheck
):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    stale.attrs["Config"]["Healthcheck"] = healthcheck
    stale.image.attrs["Config"]["Healthcheck"] = healthcheck

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize("ports", UNSAFE_EFFECTIVE_PORTS)
def test_shared_fixed_policy_rejects_malformed_or_effective_host_port_mappings(
    runtime, docker_client, target, ports
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    inspected.attrs["NetworkSettings"]["Ports"] = ports
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected

    with pytest.raises(ContainerConflict):
        if target == "initializer":
            runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        else:
            runtime.status(RUN_ID)

    inspected.start.assert_not_called()
    inspected.stop.assert_not_called()
    inspected.remove.assert_not_called()


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize("publish_all_ports", NON_FALSE_PUBLISH_ALL_PORTS)
def test_shared_fixed_policy_requires_publish_all_ports_exactly_false(
    runtime, docker_client, target, publish_all_ports
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    inspected.attrs["HostConfig"]["PublishAllPorts"] = publish_all_ports
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected

    with pytest.raises(ContainerConflict):
        if target == "initializer":
            runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        else:
            runtime.status(RUN_ID)

    inspected.start.assert_not_called()
    inspected.stop.assert_not_called()
    inspected.remove.assert_not_called()


def test_start_rejects_exited_stale_initializer_without_removing_it(
    runtime, docker_client
):
    stale = _container(
        status="exited",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


def test_start_rejects_a_mismatched_stale_initializer(runtime, docker_client):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="worker",
    )

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.api.create_container.assert_not_called()


def test_start_rejects_non_allowlisted_image(runtime, docker_client):
    with pytest.raises(ImageNotAllowed):
        runtime.start(uuid4(), RUN_TOKEN, "attacker/image:latest")

    docker_client.containers.get.assert_not_called()
    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize(
    ("existing", "token"),
    [
        (_container(run_id=uuid4()), RUN_TOKEN),
        (_container(image="other:latest"), RUN_TOKEN),
        (_container(token_digest="b" * 64), RUN_TOKEN),
    ],
)
def test_start_rejects_mismatched_same_name_container(
    runtime, docker_client, existing, token
):
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = existing

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, token, WORKER_IMAGE)

    docker_client.api.create_container.assert_not_called()
    existing.start.assert_not_called()


def test_start_is_idempotent_for_matching_running_container(runtime, docker_client):
    existing = _container(status="running")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = existing

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert result.container_id == "container-id"
    assert result.run_token_sha256 == RUN_TOKEN_SHA256
    docker_client.api.create_container.assert_not_called()
    existing.start.assert_not_called()


def test_start_resumes_matching_stopped_container(runtime, docker_client):
    existing = _container(status="exited")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = existing

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    existing.start.assert_called_once_with()
    assert result.state == "running"


def test_restart_restarts_matching_running_container(runtime, docker_client):
    existing = _container(status="running")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = existing

    result = runtime.restart(RUN_ID)

    existing.restart.assert_called_once_with(timeout=30)
    existing.start.assert_not_called()
    assert result.state == "running"
    assert result.run_token_sha256 == RUN_TOKEN_SHA256


def test_restart_starts_matching_exited_container(runtime, docker_client):
    existing = _container(status="exited")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = existing

    result = runtime.restart(RUN_ID)

    existing.start.assert_called_once_with()
    existing.restart.assert_not_called()
    assert result.state == "running"


def test_restart_rejects_absent_container(runtime, docker_client):
    docker_client.containers.get.side_effect = DockerNotFound

    with pytest.raises(ContainerConflict):
        runtime.restart(RUN_ID)


def test_start_rejects_a_same_name_volume_with_wrong_labels(runtime, docker_client):
    data = docker_client._test_volumes[data_volume_name(RUN_ID)]
    data.attrs["Labels"]["qjudge.integrity.run_id"] = str(uuid4())

    with pytest.raises(VolumeConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    docker_client.api.create_container.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    ("field", "unsafe_value"),
    [
        ("Driver", "local-persist"),
        ("Options", {"type": "none", "device": "/", "o": "bind"}),
        ("Scope", "global"),
        ("Mountpoint", "/"),
    ],
)
def test_every_worker_lifecycle_rejects_hostile_volume_provenance(
    runtime,
    docker_client,
    operation,
    field,
    unsafe_value,
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    data = docker_client._test_volumes[data_volume_name(RUN_ID)]
    data.attrs[field] = unsafe_value
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(VolumeConflict):
        _exercise_policy_target(runtime, target="worker", operation=operation)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    "field",
    ["Driver", "Labels", "Mountpoint", "Name", "Options", "Scope"],
)
def test_every_worker_lifecycle_requires_complete_volume_provenance(
    runtime,
    docker_client,
    operation,
    field,
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    data = docker_client._test_volumes[data_volume_name(RUN_ID)]
    del data.attrs[field]
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(VolumeConflict):
        _exercise_policy_target(runtime, target="worker", operation=operation)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize(
    ("field", "unsafe_value"),
    [
        ("Driver", "local-persist"),
        ("Options", {"type": "none", "device": "/", "o": "bind"}),
        ("Scope", "global"),
        ("Mountpoint", "/"),
    ],
)
def test_initializer_cleanup_rejects_hostile_secret_volume_provenance(
    runtime,
    docker_client,
    field,
    unsafe_value,
):
    stale = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )
    secret = docker_client._test_volumes[secret_volume_name(RUN_ID)]
    secret.attrs[field] = unsafe_value
    docker_client.containers.get.side_effect = _find_only_initializer(
        stale, docker_client
    )

    with pytest.raises(VolumeConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()


def test_stop_uses_fixed_timeout_and_is_idempotent(runtime, docker_client):
    running = _container(status="running")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = running

    stopped = runtime.stop(RUN_ID)

    running.stop.assert_called_once_with(timeout=30)
    assert stopped.state == "stopped"

    running.reset_mock()
    running.status = "exited"
    running.attrs["State"]["Status"] = "exited"
    runtime.stop(RUN_ID)
    running.stop.assert_not_called()


def test_lifecycle_rejects_a_same_name_non_allowlisted_container(
    runtime, docker_client
):
    attacker = _container(image="attacker/image:latest", status="running")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = attacker

    with pytest.raises(ContainerConflict):
        runtime.stop(RUN_ID)

    attacker.stop.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    ("path", "unsafe_value"),
    [
        (("Config", "Env"), _environment() + ["ATTACKER_CONTROLLED=true"]),
        (("Config", "User"), "0:0"),
        (("Config", "Cmd"), ["sh"]),
        (("Config", "Entrypoint"), ["/attacker-entrypoint"]),
        (("Config", "Healthcheck"), {"Test": ["CMD", "true"]}),
        (
            ("Config", "Labels"),
            {
                "qjudge.integrity.run_id": str(RUN_ID),
                "qjudge.integrity.role": "worker",
                "qjudge.integrity.run_token_sha256": RUN_TOKEN_SHA256,
                "attacker-controlled": "true",
            },
        ),
        (("HostConfig", "NetworkMode"), "bridge"),
        (
            ("HostConfig", "Binds"),
            [
                data_volume_name(RUN_ID) + ":/run-data:rw",
                secret_volume_name(RUN_ID) + ":/run-secrets:ro",
                "/:/host:rw",
            ],
        ),
        (("HostConfig", "PublishAllPorts"), True),
        (("HostConfig", "ReadonlyRootfs"), False),
        (("HostConfig", "CapAdd"), ["SYS_ADMIN"]),
        (("HostConfig", "CapDrop"), []),
        (("HostConfig", "Privileged"), True),
        (("HostConfig", "SecurityOpt"), []),
        (("HostConfig", "Tmpfs"), {"/tmp": "rw,exec,size=64m"}),
        (("HostConfig", "Memory"), 1024 * 1024 * 1024),
        (("HostConfig", "NanoCpus"), 1_000_000_000),
        (("HostConfig", "PidsLimit"), 512),
        (
            ("HostConfig", "RestartPolicy"),
            {"Name": "always", "MaximumRetryCount": 0},
        ),
        (("HostConfig", "PortBindings"), {"8020/tcp": [{"HostPort": "8020"}]}),
        (("HostConfig", "Devices"), [{"PathOnHost": "/dev/kvm"}]),
        (("HostConfig", "DeviceRequests"), [{"Capabilities": [["gpu"]]}]),
        (("HostConfig", "PidMode"), "host"),
        (("HostConfig", "IpcMode"), "host"),
        (("State", "Status"), None),
        (
            ("Mounts",),
            [
                {
                    "Type": "bind",
                    "Name": "",
                    "Destination": "/host",
                    "Mode": "rw",
                    "RW": True,
                }
            ],
        ),
        (
            ("NetworkSettings", "Networks"),
            {"qjudge-test-network": {}, "bridge": {}},
        ),
        (
            ("NetworkSettings", "Ports"),
            {"8020/tcp": [{"HostIp": "0.0.0.0", "HostPort": "32768"}]},
        ),
    ],
    ids=[
        "environment",
        "user",
        "command",
        "entrypoint",
        "healthcheck",
        "labels",
        "network-mode",
        "binds",
        "publish-all-ports",
        "read-only-rootfs",
        "cap-add",
        "cap-drop",
        "privileged",
        "security-options",
        "tmpfs",
        "memory",
        "cpu",
        "pids",
        "restart-policy",
        "port-bindings",
        "devices",
        "device-requests",
        "pid-mode",
        "ipc-mode",
        "malformed-state",
        "mounts",
        "network-attachments",
        "effective-port-mappings",
    ],
)
def test_every_lifecycle_rejects_an_existing_worker_with_any_policy_mismatch(
    runtime, docker_client, operation, path, unsafe_value
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    _replace_nested(worker.attrs, path, unsafe_value)
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        if operation == "start":
            runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        else:
            getattr(runtime, operation)(RUN_ID)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    "path",
    [
        ("Config",),
        ("Config", "Image"),
        ("Config", "Env"),
        ("Config", "User"),
        ("Config", "Cmd"),
        ("Config", "Entrypoint"),
        ("Config", "Healthcheck"),
        ("Config", "Labels"),
        ("HostConfig",),
        ("HostConfig", "NetworkMode"),
        ("HostConfig", "Binds"),
        ("HostConfig", "PublishAllPorts"),
        ("HostConfig", "ReadonlyRootfs"),
        ("HostConfig", "CapAdd"),
        ("HostConfig", "CapDrop"),
        ("HostConfig", "Privileged"),
        ("HostConfig", "SecurityOpt"),
        ("HostConfig", "Tmpfs"),
        ("HostConfig", "Memory"),
        ("HostConfig", "NanoCpus"),
        ("HostConfig", "PidsLimit"),
        ("HostConfig", "RestartPolicy"),
        ("HostConfig", "PortBindings"),
        ("HostConfig", "Devices"),
        ("HostConfig", "DeviceRequests"),
        ("HostConfig", "PidMode"),
        ("HostConfig", "IpcMode"),
        ("Mounts",),
        ("Mounts", 0, "Type"),
        ("Mounts", 0, "Name"),
        ("Mounts", 0, "Source"),
        ("Mounts", 0, "Destination"),
        ("Mounts", 0, "Driver"),
        ("Mounts", 0, "Mode"),
        ("Mounts", 0, "Propagation"),
        ("Mounts", 0, "RW"),
        ("NetworkSettings",),
        ("NetworkSettings", "Networks"),
        ("NetworkSettings", "Ports"),
        ("State",),
        ("State", "Status"),
    ],
)
def test_every_lifecycle_rejects_existing_worker_with_any_missing_inspect_field(
    runtime, docker_client, operation, path
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    _make_optional_image_field_required(worker, path)
    _delete_nested(worker.attrs, path)
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        if operation == "start":
            runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        else:
            getattr(runtime, operation)(RUN_ID)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    "image_path",
    [
        ("Config",),
        ("Config", "Env"),
        ("Config", "Cmd"),
        ("Config", "Entrypoint"),
        ("Config", "Healthcheck"),
    ],
)
def test_every_lifecycle_rejects_worker_with_missing_image_inspect_field(
    runtime, docker_client, operation, image_path
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    _make_optional_image_field_required(worker, image_path)
    _delete_nested(worker.image.attrs, image_path)
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        if operation == "start":
            runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        else:
            getattr(runtime, operation)(RUN_ID)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize(
    ("field", "malformed_value"),
    [
        ("Env", "PATH=/usr/local/bin"),
        ("Cmd", "uvicorn"),
        ("Entrypoint", {"command": "sh"}),
        ("Healthcheck", {"Test": "CMD true"}),
    ],
)
def test_every_lifecycle_rejects_malformed_matching_image_policy(
    runtime, docker_client, operation, field, malformed_value
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    worker.attrs["Config"][field] = malformed_value
    worker.image.attrs["Config"][field] = malformed_value
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        if operation == "start":
            runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        else:
            getattr(runtime, operation)(RUN_ID)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize("operation", ["start", "status", "stop", "destroy"])
@pytest.mark.parametrize("healthcheck", MALFORMED_HEALTHCHECKS)
def test_every_lifecycle_rejects_malformed_matching_healthcheck(
    runtime, docker_client, operation, healthcheck
):
    worker = _container(status="exited" if operation == "destroy" else "running")
    worker.attrs["Config"]["Healthcheck"] = healthcheck
    worker.image.attrs["Config"]["Healthcheck"] = healthcheck
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    with pytest.raises(ContainerConflict):
        if operation == "start":
            runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        else:
            getattr(runtime, operation)(RUN_ID)

    worker.start.assert_not_called()
    worker.stop.assert_not_called()
    worker.remove.assert_not_called()


@pytest.mark.parametrize(
    "healthcheck",
    [
        pytest.param(None, id="absent"),
        pytest.param({"Test": ["NONE"]}, id="disabled"),
        pytest.param({"Test": ["CMD-SHELL", "true"]}, id="cmd-shell"),
        pytest.param(
            {
                "Test": ["CMD-SHELL", "true"],
                "Interval": 0,
                "Timeout": 0,
                "Retries": 0,
                "StartPeriod": 0,
                "StartInterval": 0,
            },
            id="zero-duration-boundaries",
        ),
        pytest.param(
            {
                "Test": ["CMD-SHELL", "true"],
                "Interval": 1_000_000,
                "Timeout": 1_000_000,
                "Retries": 1,
                "StartPeriod": 1_000_000,
                "StartInterval": 1_000_000,
            },
            id="minimum-nonzero-duration-boundaries",
        ),
        pytest.param(
            {
                "Test": ["CMD-SHELL", "true"],
                "Interval": 1_000_001,
                "Timeout": 1_000_001,
                "Retries": 2,
                "StartPeriod": 1_000_001,
                "StartInterval": 1_000_001,
            },
            id="above-minimum-durations",
        ),
    ],
)
@pytest.mark.parametrize("target", ["worker", "initializer"])
def test_shared_fixed_policy_accepts_canonical_healthcheck_forms_and_boundaries(
    runtime, docker_client, target, healthcheck
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    inspected.attrs["Config"]["Healthcheck"] = healthcheck
    inspected.image.attrs["Config"]["Healthcheck"] = healthcheck
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
        result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        inspected.remove.assert_called_once_with()
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected
        result = runtime.status(RUN_ID)

    assert result.state == "running"


@pytest.mark.parametrize("target", ["worker", "initializer"])
@pytest.mark.parametrize("ports", SAFE_EFFECTIVE_PORTS)
def test_shared_fixed_policy_accepts_only_explicitly_unbound_effective_ports(
    runtime, docker_client, target, ports
):
    inspected = _container(
        status="created" if target == "initializer" else "running",
        name=(secret_initializer_name(RUN_ID) if target == "initializer" else None),
        role="secret-initializer" if target == "initializer" else "worker",
    )
    inspected.attrs["NetworkSettings"]["Ports"] = ports
    if target == "initializer":
        docker_client.containers.get.side_effect = _find_only_initializer(
            inspected, docker_client
        )
        result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
        inspected.remove.assert_called_once_with()
    else:
        docker_client.containers.get.side_effect = None
        docker_client.containers.get.return_value = inspected
        result = runtime.status(RUN_ID)

    assert result.state == "running"


def test_destroy_requires_stopped_container(runtime, docker_client):
    running = _container(status="running")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = running

    with pytest.raises(ContainerNotStopped):
        runtime.destroy(RUN_ID)

    running.remove.assert_not_called()
    docker_client._test_volumes[secret_volume_name(RUN_ID)].remove.assert_not_called()


def test_destroy_keeps_data_volume_and_removes_secret(runtime, docker_client):
    stopped = _container(status="exited")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = stopped

    result = runtime.destroy(RUN_ID)

    stopped.remove.assert_called_once_with()
    docker_client._test_volumes[
        secret_volume_name(RUN_ID)
    ].remove.assert_called_once_with()
    docker_client._test_volumes[data_volume_name(RUN_ID)].remove.assert_not_called()
    assert result.data_volume_retained is True


def test_destroy_is_idempotent_after_container_removal(runtime, docker_client):
    result = runtime.destroy(RUN_ID)

    docker_client._test_volumes[
        secret_volume_name(RUN_ID)
    ].remove.assert_called_once_with()
    assert result.data_volume_retained is True


def test_purge_data_rejects_any_existing_container(runtime, docker_client):
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = _container(status="exited")

    with pytest.raises(ContainerConflict):
        runtime.purge_data(RUN_ID)

    docker_client._test_volumes[data_volume_name(RUN_ID)].remove.assert_not_called()


def test_purge_data_requires_absent_container_and_removes_only_run_volume(
    runtime, docker_client
):
    result = runtime.purge_data(RUN_ID)

    docker_client._test_volumes[
        data_volume_name(RUN_ID)
    ].remove.assert_called_once_with()
    docker_client._test_volumes[secret_volume_name(RUN_ID)].remove.assert_not_called()
    assert result.data_purged is True


def test_purge_data_rejects_a_mislabeled_exact_name_volume(runtime, docker_client):
    data = docker_client._test_volumes[data_volume_name(RUN_ID)]
    data.attrs["Labels"]["qjudge.integrity.kind"] = "secret"

    with pytest.raises(VolumeConflict):
        runtime.purge_data(RUN_ID)

    data.remove.assert_not_called()


def test_status_reports_secret_free_reconciliation_identity(runtime, docker_client):
    worker = _container(status="running")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = worker

    result = runtime.status(RUN_ID)

    assert result.run_id == RUN_ID
    assert result.exists is True
    assert result.state == "running"
    assert result.container_id == "container-id"
    assert result.container_name == container_name(RUN_ID)
    assert result.image_digest == IMAGE_DIGEST
    assert result.run_token_sha256 == RUN_TOKEN_SHA256
    assert RUN_TOKEN not in repr(result)


def test_status_reports_absent_without_creating_any_resource(runtime, docker_client):
    result = runtime.status(RUN_ID)

    assert result.run_id == RUN_ID
    assert result.exists is False
    assert result.state == "absent"
    docker_client.volumes.get.assert_not_called()
    docker_client.api.create_container.assert_not_called()


def test_worker_reads_the_controller_fixed_environment(monkeypatch, tmp_path):
    token_path = tmp_path / "token"
    monkeypatch.setenv("INTEGRITY_RUN_ID", str(RUN_ID))
    monkeypatch.setenv("BACKEND_INTERNAL_URL", "http://backend:8000")
    monkeypatch.setenv("RUN_TOKEN_FILE", str(token_path))
    monkeypatch.setenv("RUN_DATA_DIR", str(tmp_path / "data"))

    settings = WorkerSettings.from_environment()

    assert settings.run_id == RUN_ID
    assert settings.backend_base_url == "http://backend:8000"
    assert settings.token_path == token_path
    assert settings.data_root == tmp_path / "data"
