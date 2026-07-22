from __future__ import annotations

import hashlib
import io
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


def _environment(run_id: UUID = RUN_ID) -> list[str]:
    return IMAGE_ENVIRONMENT + [
        "INTEGRITY_RUN_ID=" + str(run_id),
        "BACKEND_INTERNAL_URL=http://backend:8000",
        "RUN_TOKEN_FILE=/run-secrets/token",
        "RUN_DATA_DIR=/run-data",
    ]


class DockerNotFound(Exception):
    status_code = 404


def _volume(name: str, *, kind: str) -> Mock:
    volume = Mock()
    volume.name = name
    volume.attrs = {
        "Labels": {
            "qjudge.integrity.run_id": str(RUN_ID),
            "qjudge.integrity.kind": kind,
        }
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
    worker.image.attrs = {
        "Config": {
            "Env": IMAGE_ENVIRONMENT,
            "Cmd": IMAGE_COMMAND,
            "Entrypoint": IMAGE_ENTRYPOINT,
            "Healthcheck": IMAGE_HEALTHCHECK,
        }
    }
    is_initializer = role == "secret-initializer"
    if is_initializer:
        binds = [secret_volume_name(RUN_ID) + ":/run-secrets:rw"]
        mounts = [
            {
                "Type": "volume",
                "Name": secret_volume_name(RUN_ID),
                "Destination": "/run-secrets",
                "Mode": "rw",
                "RW": True,
            }
        ]
        network_mode = "none"
        tmpfs = {"/tmp": "rw,noexec,nosuid,size=16m"}
        memory = 64 * 1024 * 1024
        nano_cpus = 100_000_000
        pids_limit = 16
        restart_policy = {"Name": "no", "MaximumRetryCount": 0}
        environment = IMAGE_ENVIRONMENT
    else:
        binds = [
            data_volume_name(RUN_ID) + ":/run-data:rw",
            secret_volume_name(RUN_ID) + ":/run-secrets:ro",
        ]
        mounts = [
            {
                "Type": "volume",
                "Name": data_volume_name(RUN_ID),
                "Destination": "/run-data",
                "Mode": "rw",
                "RW": True,
            },
            {
                "Type": "volume",
                "Name": secret_volume_name(RUN_ID),
                "Destination": "/run-secrets",
                "Mode": "ro",
                "RW": False,
            },
        ]
        network_mode = "qjudge-test-network"
        tmpfs = {"/tmp": "rw,noexec,nosuid,size=64m"}
        memory = 512 * 1024 * 1024
        nano_cpus = 500_000_000
        pids_limit = 128
        restart_policy = {"Name": "unless-stopped", "MaximumRetryCount": 0}
        environment = _environment(run_id)
    worker.attrs = {
        "Config": {
            "Image": image,
            "Env": environment,
            "User": "10001:10001",
            "Cmd": IMAGE_COMMAND,
            "Entrypoint": IMAGE_ENTRYPOINT,
            "Healthcheck": IMAGE_HEALTHCHECK,
            "Labels": {
                "qjudge.integrity.run_id": str(run_id),
                "qjudge.integrity.role": role,
                "qjudge.integrity.run_token_sha256": token_digest,
            },
        },
        "HostConfig": {
            "NetworkMode": network_mode,
            "Binds": binds,
            "PublishAllPorts": False,
            "ReadonlyRootfs": True,
            "CapAdd": None,
            "CapDrop": ["ALL"],
            "Privileged": False,
            "SecurityOpt": ["no-new-privileges"],
            "Tmpfs": tmpfs,
            "Memory": memory,
            "NanoCpus": nano_cpus,
            "PidsLimit": pids_limit,
            "RestartPolicy": restart_policy,
            "PortBindings": {},
            "Devices": [],
            "DeviceRequests": None,
            "PidMode": "",
            "IpcMode": "private",
        },
        "Mounts": mounts,
        "NetworkSettings": {
            "Networks": {network_mode: {}},
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


def _find_only_initializer(initializer: Mock):
    def get_container(name: str):
        if name == secret_initializer_name(RUN_ID):
            return initializer
        raise DockerNotFound

    return get_container


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
    client.containers.get.side_effect = DockerNotFound

    volumes = {
        data_volume_name(RUN_ID): _volume(data_volume_name(RUN_ID), kind="data"),
        secret_volume_name(RUN_ID): _volume(
            secret_volume_name(RUN_ID), kind="secret"
        ),
    }

    def get_volume(name):
        try:
            return volumes[name]
        except KeyError:
            raise DockerNotFound from None

    def create_volume(*, name, labels):
        volume = Mock()
        volume.name = name
        volume.attrs = {"Labels": labels}
        volumes[name] = volume
        return volume

    client.volumes.get.side_effect = get_volume
    client.volumes.create.side_effect = create_volume
    client._test_volumes = volumes
    client._test_worker = _container(status="created")
    client._test_initializer = _container(
        status="created",
        name=secret_initializer_name(RUN_ID),
        role="secret-initializer",
    )

    def create_container(**kwargs):
        if kwargs["name"] == secret_initializer_name(RUN_ID):
            return client._test_initializer
        return client._test_worker

    client.containers.create.side_effect = create_container
    return client


@pytest.fixture
def runtime(settings, docker_client):
    return DockerRuntime(client=docker_client, settings=settings)


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

    kwargs = docker_client.containers.create.call_args.kwargs
    assert kwargs["image"] == WORKER_IMAGE
    assert kwargs["name"] == container_name(RUN_ID)
    assert kwargs["environment"] == {
        "INTEGRITY_RUN_ID": str(RUN_ID),
        "BACKEND_INTERNAL_URL": "http://backend:8000",
        "RUN_TOKEN_FILE": "/run-secrets/token",
        "RUN_DATA_DIR": "/run-data",
    }
    assert kwargs["volumes"] == {
        data_volume_name(RUN_ID): {"bind": "/run-data", "mode": "rw"},
        secret_volume_name(RUN_ID): {"bind": "/run-secrets", "mode": "ro"},
    }
    assert kwargs["privileged"] is False
    assert kwargs["read_only"] is True
    assert kwargs["user"] == "10001:10001"
    assert kwargs["tmpfs"] == {"/tmp": "rw,noexec,nosuid,size=64m"}
    assert kwargs["cap_drop"] == ["ALL"]
    assert kwargs["security_opt"] == ["no-new-privileges"]
    assert kwargs["mem_limit"] == "512m"
    assert kwargs["nano_cpus"] == 500_000_000
    assert kwargs["pids_limit"] == 128
    assert kwargs["network"] == "qjudge-test-network"
    assert kwargs["publish_all_ports"] is False
    assert kwargs["restart_policy"] == {"Name": "unless-stopped"}
    assert kwargs["labels"] == {
        "qjudge.integrity.run_id": str(RUN_ID),
        "qjudge.integrity.role": "worker",
        "qjudge.integrity.run_token_sha256": RUN_TOKEN_SHA256,
    }
    assert result.worker_url == f"http://{container_name(RUN_ID)}:8020"
    assert result.image_digest == IMAGE_DIGEST


def test_start_creates_exactly_labelled_data_and_secret_volumes(
    runtime, docker_client
):
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

    destination, archive = initializer.put_archive.call_args.args
    assert destination == "/run-secrets"
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
        member = tar.getmember("token")
        assert member.uid == 10001
        assert member.gid == 10001
        assert member.mode == 0o400
        extracted = tar.extractfile(member)
        assert extracted is not None
        assert extracted.read() == RUN_TOKEN.encode("utf-8")
    initializer.put_archive.assert_called_once()
    initializer.remove.assert_called_once_with()
    initializer.start.assert_not_called()
    worker.put_archive.assert_not_called()
    worker.start.assert_called_once_with()


def test_secret_initializer_is_fixed_networkless_and_mounts_only_secret_rw(
    runtime, docker_client
):
    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    initializer_kwargs = docker_client.containers.create.call_args_list[0].kwargs
    assert initializer_kwargs == {
        "image": WORKER_IMAGE,
        "name": secret_initializer_name(RUN_ID),
        "volumes": {
            secret_volume_name(RUN_ID): {"bind": "/run-secrets", "mode": "rw"}
        },
        "network_mode": "none",
        "publish_all_ports": False,
        "user": "10001:10001",
        "read_only": True,
        "tmpfs": {"/tmp": "rw,noexec,nosuid,size=16m"},
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges"],
        "privileged": False,
        "mem_limit": "64m",
        "nano_cpus": 100_000_000,
        "pids_limit": 16,
        "restart_policy": {"Name": "no"},
        "labels": {
            "qjudge.integrity.run_id": str(RUN_ID),
            "qjudge.integrity.role": "secret-initializer",
            "qjudge.integrity.run_token_sha256": RUN_TOKEN_SHA256,
        },
    }


def test_secret_initializer_is_removed_before_final_worker_starts(
    runtime, docker_client
):
    operations = []
    initializer = docker_client._test_initializer
    worker = docker_client._test_worker
    initializer.put_archive.side_effect = lambda *_args: operations.append("populate") or True
    initializer.remove.side_effect = lambda: operations.append("remove")
    worker.start.side_effect = lambda: operations.append("start-worker")

    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert operations == ["populate", "remove", "start-worker"]


def test_secret_initializer_is_removed_when_archive_population_fails(
    runtime, docker_client
):
    initializer = docker_client._test_initializer
    initializer.put_archive.return_value = False

    with pytest.raises(OSError, match="populate"):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    initializer.remove.assert_called_once_with()
    assert [
        call.kwargs["name"] for call in docker_client.containers.create.call_args_list
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

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_called_once_with()
    docker_client._test_initializer.put_archive.assert_called_once()
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
    docker_client.containers.create.assert_not_called()


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
        ("Mounts", 0, "Destination"),
        ("Mounts", 0, "Mode"),
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
    _delete_nested(stale.attrs, path)

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.containers.create.assert_not_called()


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
    _delete_nested(stale.image.attrs, image_path)

    def get_container(name):
        if name == secret_initializer_name(RUN_ID):
            return stale
        raise DockerNotFound

    docker_client.containers.get.side_effect = get_container

    with pytest.raises(ContainerConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    stale.remove.assert_not_called()
    docker_client.containers.create.assert_not_called()


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
    docker_client.containers.create.assert_not_called()


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
    docker_client.containers.create.assert_not_called()


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
        docker_client.containers.get.side_effect = _find_only_initializer(inspected)
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
        docker_client.containers.get.side_effect = _find_only_initializer(inspected)
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
    docker_client.containers.create.assert_not_called()


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
    docker_client.containers.create.assert_not_called()


def test_start_rejects_non_allowlisted_image(runtime, docker_client):
    with pytest.raises(ImageNotAllowed):
        runtime.start(uuid4(), RUN_TOKEN, "attacker/image:latest")

    docker_client.containers.get.assert_not_called()
    docker_client.containers.create.assert_not_called()


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

    docker_client.containers.create.assert_not_called()
    existing.start.assert_not_called()


def test_start_is_idempotent_for_matching_running_container(runtime, docker_client):
    existing = _container(status="running")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = existing

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    assert result.container_id == "container-id"
    assert result.run_token_sha256 == RUN_TOKEN_SHA256
    docker_client.containers.create.assert_not_called()
    existing.start.assert_not_called()


def test_start_resumes_matching_stopped_container(runtime, docker_client):
    existing = _container(status="exited")
    docker_client.containers.get.side_effect = None
    docker_client.containers.get.return_value = existing

    result = runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    existing.start.assert_called_once_with()
    assert result.state == "running"


def test_start_rejects_a_same_name_volume_with_wrong_labels(runtime, docker_client):
    data = docker_client._test_volumes[data_volume_name(RUN_ID)]
    data.attrs["Labels"]["qjudge.integrity.run_id"] = str(uuid4())

    with pytest.raises(VolumeConflict):
        runtime.start(RUN_ID, RUN_TOKEN, WORKER_IMAGE)

    docker_client.containers.create.assert_not_called()


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


def test_lifecycle_rejects_a_same_name_non_allowlisted_container(runtime, docker_client):
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
        ("Mounts", 0, "Destination"),
        ("Mounts", 0, "Mode"),
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
        docker_client.containers.get.side_effect = _find_only_initializer(inspected)
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
        docker_client.containers.get.side_effect = _find_only_initializer(inspected)
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
    docker_client._test_volumes[secret_volume_name(RUN_ID)].remove.assert_called_once_with()
    docker_client._test_volumes[data_volume_name(RUN_ID)].remove.assert_not_called()
    assert result.data_volume_retained is True


def test_destroy_is_idempotent_after_container_removal(runtime, docker_client):
    result = runtime.destroy(RUN_ID)

    docker_client._test_volumes[secret_volume_name(RUN_ID)].remove.assert_called_once_with()
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

    docker_client._test_volumes[data_volume_name(RUN_ID)].remove.assert_called_once_with()
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
    docker_client.containers.create.assert_not_called()


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
