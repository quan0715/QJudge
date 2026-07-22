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
    worker.attrs = {
        "Config": {
            "Image": image,
            "Labels": {
                "qjudge.integrity.run_id": str(run_id),
                "qjudge.integrity.role": role,
                "qjudge.integrity.run_token_sha256": token_digest,
            },
        },
        "State": {"Status": status},
    }
    return worker


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
