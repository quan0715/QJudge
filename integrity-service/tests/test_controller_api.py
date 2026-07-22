from __future__ import annotations

import hashlib
from unittest.mock import Mock
from uuid import UUID

from fastapi.testclient import TestClient
import pytest

from integrity_service.controller.app import create_app
from integrity_service.controller.docker_runtime import (
    ContainerConflict,
    DestroyResult,
    ImageNotAllowed,
    PurgeDataResult,
    RunStatus,
    StartResult,
    StopResult,
)
from integrity_service.controller.settings import ControllerSettings


RUN_ID = UUID("11111111-1111-1111-1111-111111111111")
TOKEN = "controller-secret"
RUN_TOKEN = "run-secret"
WORKER_IMAGE = "oj-integrity-worker:latest"


@pytest.fixture
def settings(tmp_path):
    token_file = tmp_path / "controller-token"
    token_file.write_bytes(TOKEN.encode("utf-8"))
    return ControllerSettings(
        internal_token_file=token_file,
        allowed_worker_images=frozenset({WORKER_IMAGE}),
        backend_internal_url="http://backend:8000",
        worker_network="qjudge-test-network",
    )


@pytest.fixture
def runtime():
    runtime = Mock()
    runtime.start.return_value = StartResult(
        container_id="container-id",
        container_name="qjudge-integrity-worker-" + str(RUN_ID),
        worker_url="http://qjudge-integrity-worker-" + str(RUN_ID) + ":8020",
        image_digest="sha256:" + "a" * 64,
        state="running",
        run_token_sha256=hashlib.sha256(RUN_TOKEN.encode()).hexdigest(),
    )
    runtime.stop.return_value = StopResult(run_id=RUN_ID, state="stopped")
    runtime.destroy.return_value = DestroyResult(
        run_id=RUN_ID,
        destroyed=True,
        data_volume_retained=True,
    )
    runtime.purge_data.return_value = PurgeDataResult(
        run_id=RUN_ID,
        data_purged=True,
    )
    runtime.status.return_value = RunStatus(
        run_id=RUN_ID,
        exists=True,
        state="running",
        container_id="container-id",
        container_name="qjudge-integrity-worker-" + str(RUN_ID),
        worker_url="http://qjudge-integrity-worker-" + str(RUN_ID) + ":8020",
        image_digest="sha256:" + "a" * 64,
        run_token_sha256=hashlib.sha256(RUN_TOKEN.encode()).hexdigest(),
    )
    return runtime


@pytest.fixture
def client(settings, runtime):
    return TestClient(create_app(runtime=runtime, settings=settings))


def _headers(token: str = TOKEN) -> dict[str, str]:
    return {"Authorization": "Bearer " + token}


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Basic " + TOKEN},
        {"Authorization": "Bearer wrong"},
        {"Authorization": "Bearer "},
    ],
)
def test_every_controller_endpoint_requires_bearer_authentication(
    client, runtime, headers
):
    calls = [
        (
            "post",
            f"/v1/runs/{RUN_ID}/start",
            {"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE},
        ),
        ("post", f"/v1/runs/{RUN_ID}/stop", {}),
        ("post", f"/v1/runs/{RUN_ID}/destroy", {}),
        ("post", f"/v1/runs/{RUN_ID}/purge-data", {}),
        ("get", f"/v1/runs/{RUN_ID}/status", None),
    ]

    for method, path, payload in calls:
        if method == "get":
            response = client.get(path, headers=headers)
        else:
            response = client.post(path, json=payload, headers=headers)
        assert response.status_code == 401

    runtime.start.assert_not_called()
    runtime.stop.assert_not_called()
    runtime.destroy.assert_not_called()
    runtime.purge_data.assert_not_called()
    runtime.status.assert_not_called()


def test_authentication_reads_exact_token_file_bytes_on_every_request(
    client, settings, runtime
):
    assert client.get(f"/v1/runs/{RUN_ID}/status", headers=_headers()).status_code == 200

    settings.internal_token_file.write_bytes(b"rotated-secret")

    assert client.get(f"/v1/runs/{RUN_ID}/status", headers=_headers()).status_code == 401
    assert (
        client.get(
            f"/v1/runs/{RUN_ID}/status",
            headers=_headers("rotated-secret"),
        ).status_code
        == 200
    )
    assert runtime.status.call_count == 2


def test_authentication_uses_constant_time_byte_comparison(
    client, monkeypatch
):
    import integrity_service.controller.app as app_module

    compared = []
    real_compare = app_module.hmac.compare_digest

    def compare(first, second):
        compared.append((first, second))
        return real_compare(first, second)

    monkeypatch.setattr(app_module.hmac, "compare_digest", compare)

    response = client.get(f"/v1/runs/{RUN_ID}/status", headers=_headers())

    assert response.status_code == 200
    assert compared == [(TOKEN.encode("utf-8"), TOKEN.encode("utf-8"))]


def test_start_accepts_only_run_token_and_worker_image(client, runtime):
    response = client.post(
        f"/v1/runs/{RUN_ID}/start",
        json={
            "run_token": RUN_TOKEN,
            "worker_image": WORKER_IMAGE,
            "environment": {"ESCAPE": "1"},
            "mounts": ["/:/host"],
            "command": ["sh"],
            "capabilities": ["SYS_ADMIN"],
            "network": "host",
            "privileged": True,
        },
        headers=_headers(),
    )

    assert response.status_code == 422
    runtime.start.assert_not_called()


@pytest.mark.parametrize("field", ["run_token", "worker_image"])
def test_start_rejects_blank_required_strings(client, runtime, field):
    payload = {"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE}
    payload[field] = ""

    response = client.post(
        f"/v1/runs/{RUN_ID}/start",
        json=payload,
        headers=_headers(),
    )

    assert response.status_code == 422
    runtime.start.assert_not_called()


def test_start_delegates_only_validated_values_and_returns_identity(client, runtime):
    response = client.post(
        f"/v1/runs/{RUN_ID}/start",
        json={"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE},
        headers=_headers(),
    )

    assert response.status_code == 200
    runtime.start.assert_called_once_with(RUN_ID, RUN_TOKEN, WORKER_IMAGE)
    assert response.json() == {
        "container_id": "container-id",
        "container_name": "qjudge-integrity-worker-" + str(RUN_ID),
        "worker_url": "http://qjudge-integrity-worker-" + str(RUN_ID) + ":8020",
        "image_digest": "sha256:" + "a" * 64,
        "state": "running",
        "run_token_sha256": hashlib.sha256(RUN_TOKEN.encode()).hexdigest(),
    }


@pytest.mark.parametrize("operation", ["stop", "destroy", "purge-data"])
def test_bodyless_lifecycle_operations_reject_caller_supplied_docker_data(
    client, runtime, operation
):
    response = client.post(
        f"/v1/runs/{RUN_ID}/{operation}",
        json={"volume_name": "victim", "force": True},
        headers=_headers(),
    )

    assert response.status_code == 422
    runtime.stop.assert_not_called()
    runtime.destroy.assert_not_called()
    runtime.purge_data.assert_not_called()


def test_stop_destroy_and_purge_delegate_only_path_run_id(client, runtime):
    stopped = client.post(
        f"/v1/runs/{RUN_ID}/stop", json={}, headers=_headers()
    )
    destroyed = client.post(
        f"/v1/runs/{RUN_ID}/destroy", json={}, headers=_headers()
    )
    purged = client.post(
        f"/v1/runs/{RUN_ID}/purge-data", json={}, headers=_headers()
    )

    assert stopped.status_code == 200
    assert stopped.json() == {"run_id": str(RUN_ID), "state": "stopped"}
    assert destroyed.status_code == 200
    assert destroyed.json()["data_volume_retained"] is True
    assert purged.status_code == 200
    assert purged.json()["data_purged"] is True
    runtime.stop.assert_called_once_with(RUN_ID)
    runtime.destroy.assert_called_once_with(RUN_ID)
    runtime.purge_data.assert_called_once_with(RUN_ID)


def test_status_returns_backend_reconciliation_contract(client, runtime):
    response = client.get(f"/v1/runs/{RUN_ID}/status", headers=_headers())

    assert response.status_code == 200
    assert response.json() == {
        "run_id": str(RUN_ID),
        "exists": True,
        "state": "running",
        "container_id": "container-id",
        "container_name": "qjudge-integrity-worker-" + str(RUN_ID),
        "worker_url": "http://qjudge-integrity-worker-" + str(RUN_ID) + ":8020",
        "image_digest": "sha256:" + "a" * 64,
        "run_token_sha256": hashlib.sha256(RUN_TOKEN.encode()).hexdigest(),
    }


@pytest.mark.parametrize(
    ("failure", "expected_status"),
    [
        (ImageNotAllowed("not allowed"), 403),
        (ContainerConflict("conflict"), 409),
    ],
)
def test_controller_maps_safe_lifecycle_failures(client, runtime, failure, expected_status):
    runtime.start.side_effect = failure

    response = client.post(
        f"/v1/runs/{RUN_ID}/start",
        json={"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE},
        headers=_headers(),
    )

    assert response.status_code == expected_status
    assert RUN_TOKEN not in response.text


def test_controller_normalizes_runtime_failures_without_leaking_secrets(client, runtime):
    runtime.start.side_effect = RuntimeError("failed with " + RUN_TOKEN)

    response = client.post(
        f"/v1/runs/{RUN_ID}/start",
        json={"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE},
        headers=_headers(),
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Docker lifecycle unavailable"}
    assert RUN_TOKEN not in response.text
