from __future__ import annotations

import asyncio
import hashlib
import threading
from unittest.mock import Mock
from uuid import UUID

from fastapi.testclient import TestClient
import httpx
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
SECOND_RUN_ID = UUID("22222222-2222-2222-2222-222222222222")
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
    runtime.restart.return_value = runtime.start.return_value
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


def test_health_is_public_only_for_its_get_route(client, runtime):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert client.post("/health").status_code == 401
    assert runtime.mock_calls == []


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Basic " + TOKEN},
        {"Authorization": "Bearer wrong"},
        {"Authorization": "Bearer "},
    ],
)
def test_every_lifecycle_endpoint_requires_bearer_authentication(
    client, runtime, headers
):
    calls = [
        (
            "post",
            f"/v1/runs/{RUN_ID}/start",
            {"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE},
        ),
        ("post", f"/v1/runs/{RUN_ID}/restart", {}),
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
    runtime.restart.assert_not_called()
    runtime.stop.assert_not_called()
    runtime.destroy.assert_not_called()
    runtime.purge_data.assert_not_called()
    runtime.status.assert_not_called()


def test_authentication_reads_exact_token_file_bytes_on_every_request(
    client, settings, runtime
):
    assert (
        client.get(f"/v1/runs/{RUN_ID}/status", headers=_headers()).status_code == 200
    )

    settings.internal_token_file.write_bytes(b"rotated-secret")

    assert (
        client.get(f"/v1/runs/{RUN_ID}/status", headers=_headers()).status_code == 401
    )
    assert (
        client.get(
            f"/v1/runs/{RUN_ID}/status",
            headers=_headers("rotated-secret"),
        ).status_code
        == 200
    )
    assert runtime.status.call_count == 2


def test_authentication_uses_constant_time_byte_comparison(client, monkeypatch):
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


@pytest.mark.parametrize(
    "path",
    [
        "/v1/runs/not-a-uuid/status",
        "/v1/runs/not-a-uuid/start",
        "/not-a-controller-route",
        "/docs",
        "/redoc",
        "/openapi.json",
    ],
)
def test_authentication_runs_before_all_routing_and_path_validation(client, path):
    response = client.get(path)

    assert response.status_code == 401
    assert response.json() == {"detail": "request authentication failed"}


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_generated_api_documentation_is_disabled(client, path):
    response = client.get(path, headers=_headers())

    assert response.status_code == 404


def test_authenticated_malformed_uuid_still_uses_normal_path_validation(client):
    response = client.get("/v1/runs/not-a-uuid/status", headers=_headers())

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_slow_docker_lifecycle_call_does_not_block_other_requests(settings):
    started = threading.Event()
    release = threading.Event()

    class BlockingRuntime:
        def status(self, run_id):
            if run_id == RUN_ID:
                started.set()
                release.wait(timeout=1)
            return RunStatus(run_id=run_id, exists=False, state="absent")

    application = create_app(runtime=BlockingRuntime(), settings=settings)
    transport = httpx.ASGITransport(app=application)
    timer = threading.Timer(0.25, release.set)
    timer.start()
    slow_request = None
    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://controller.test",
        ) as async_client:
            slow_request = asyncio.create_task(
                async_client.get(
                    f"/v1/runs/{RUN_ID}/status",
                    headers=_headers(),
                )
            )
            assert await asyncio.to_thread(started.wait, 0.5)

            fast_response = await async_client.get(
                f"/v1/runs/{SECOND_RUN_ID}/status",
                headers=_headers(),
            )

            assert fast_response.status_code == 200
            assert slow_request.done() is False
            release.set()
            assert (await slow_request).status_code == 200
    finally:
        release.set()
        timer.cancel()
        if slow_request is not None and not slow_request.done():
            await slow_request


@pytest.mark.asyncio
async def test_docker_lifecycle_calls_for_the_same_run_remain_serialized(settings):
    first_started = threading.Event()
    release_first = threading.Event()

    class SerialRuntime:
        def __init__(self):
            self.call_count = 0

        def status(self, run_id):
            self.call_count += 1
            if self.call_count == 1:
                first_started.set()
                release_first.wait(timeout=1)
            return RunStatus(run_id=run_id, exists=False, state="absent")

    runtime = SerialRuntime()
    application = create_app(runtime=runtime, settings=settings)
    transport = httpx.ASGITransport(app=application)
    timer = threading.Timer(0.5, release_first.set)
    timer.start()
    first_request = None
    second_request = None
    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://controller.test",
        ) as async_client:
            first_request = asyncio.create_task(
                async_client.get(
                    f"/v1/runs/{RUN_ID}/status",
                    headers=_headers(),
                )
            )
            assert await asyncio.to_thread(first_started.wait, 0.5)
            second_request = asyncio.create_task(
                async_client.get(
                    f"/v1/runs/{RUN_ID}/status",
                    headers=_headers(),
                )
            )
            await asyncio.sleep(0.05)

            assert runtime.call_count == 1
            assert second_request.done() is False
            release_first.set()
            responses = await asyncio.gather(first_request, second_request)
            assert [response.status_code for response in responses] == [200, 200]
            assert runtime.call_count == 2
            assert application.state.run_locks == {}
    finally:
        release_first.set()
        timer.cancel()
        pending = [
            request
            for request in (first_request, second_request)
            if request is not None and not request.done()
        ]
        if pending:
            await asyncio.gather(*pending)


@pytest.mark.asyncio
async def test_completed_run_locks_are_evicted_after_many_distinct_runs(settings):
    class AbsentRuntime:
        def status(self, run_id):
            return RunStatus(run_id=run_id, exists=False, state="absent")

    application = create_app(runtime=AbsentRuntime(), settings=settings)
    transport = httpx.ASGITransport(app=application)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://controller.test",
    ) as async_client:
        for value in range(1, 101):
            run_id = UUID(int=value)
            response = await async_client.get(
                f"/v1/runs/{run_id}/status",
                headers=_headers(),
            )
            assert response.status_code == 200

    assert application.state.run_locks == {}


@pytest.mark.asyncio
async def test_lock_eviction_does_not_bypass_an_existing_same_run_waiter(settings):
    first_started = threading.Event()
    release_first = threading.Event()
    second_started = threading.Event()
    release_second = threading.Event()
    third_started = threading.Event()

    class QueuedRuntime:
        def __init__(self):
            self.call_count = 0
            self.guard = threading.Lock()

        def status(self, run_id):
            with self.guard:
                self.call_count += 1
                call_number = self.call_count
            if call_number == 1:
                first_started.set()
                release_first.wait(timeout=1)
            elif call_number == 2:
                second_started.set()
                release_second.wait(timeout=1)
            else:
                third_started.set()
            return RunStatus(run_id=run_id, exists=False, state="absent")

    runtime = QueuedRuntime()
    application = create_app(runtime=runtime, settings=settings)
    transport = httpx.ASGITransport(app=application)
    requests = []
    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://controller.test",
        ) as async_client:
            requests.append(
                asyncio.create_task(
                    async_client.get(
                        f"/v1/runs/{RUN_ID}/status",
                        headers=_headers(),
                    )
                )
            )
            assert await asyncio.to_thread(first_started.wait, 0.5)
            requests.append(
                asyncio.create_task(
                    async_client.get(
                        f"/v1/runs/{RUN_ID}/status",
                        headers=_headers(),
                    )
                )
            )
            await asyncio.sleep(0.05)
            release_first.set()
            assert (await requests[0]).status_code == 200
            assert await asyncio.to_thread(second_started.wait, 0.5)
            requests.append(
                asyncio.create_task(
                    async_client.get(
                        f"/v1/runs/{RUN_ID}/status",
                        headers=_headers(),
                    )
                )
            )
            await asyncio.sleep(0.05)

            assert third_started.is_set() is False
            assert runtime.call_count == 2
            release_second.set()
            responses = await asyncio.gather(*requests[1:])
            assert [response.status_code for response in responses] == [200, 200]
            assert runtime.call_count == 3
            assert application.state.run_locks == {}
    finally:
        release_first.set()
        release_second.set()
        pending = [request for request in requests if not request.done()]
        if pending:
            await asyncio.gather(*pending)


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


@pytest.mark.parametrize("operation", ["restart", "stop", "destroy", "purge-data"])
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
    runtime.restart.assert_not_called()
    runtime.destroy.assert_not_called()
    runtime.purge_data.assert_not_called()


def test_stop_destroy_and_purge_delegate_only_path_run_id(client, runtime):
    stopped = client.post(f"/v1/runs/{RUN_ID}/stop", json={}, headers=_headers())
    destroyed = client.post(f"/v1/runs/{RUN_ID}/destroy", json={}, headers=_headers())
    purged = client.post(f"/v1/runs/{RUN_ID}/purge-data", json={}, headers=_headers())

    assert stopped.status_code == 200
    assert stopped.json() == {"run_id": str(RUN_ID), "state": "stopped"}
    assert destroyed.status_code == 200
    assert destroyed.json()["data_volume_retained"] is True
    assert purged.status_code == 200
    assert purged.json()["data_purged"] is True
    runtime.stop.assert_called_once_with(RUN_ID)
    runtime.destroy.assert_called_once_with(RUN_ID)
    runtime.purge_data.assert_called_once_with(RUN_ID)


def test_restart_delegates_only_path_run_id_and_returns_worker_identity(
    client, runtime
):
    response = client.post(f"/v1/runs/{RUN_ID}/restart", json={}, headers=_headers())

    assert response.status_code == 200
    runtime.restart.assert_called_once_with(RUN_ID)
    assert response.json() == {
        "container_id": "container-id",
        "container_name": "qjudge-integrity-worker-" + str(RUN_ID),
        "worker_url": "http://qjudge-integrity-worker-" + str(RUN_ID) + ":8020",
        "image_digest": "sha256:" + "a" * 64,
        "state": "running",
        "run_token_sha256": hashlib.sha256(RUN_TOKEN.encode()).hexdigest(),
    }


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
def test_controller_maps_safe_lifecycle_failures(
    client, runtime, failure, expected_status
):
    runtime.start.side_effect = failure

    response = client.post(
        f"/v1/runs/{RUN_ID}/start",
        json={"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE},
        headers=_headers(),
    )

    assert response.status_code == expected_status
    assert RUN_TOKEN not in response.text


def test_controller_normalizes_runtime_failures_without_leaking_secrets(
    client, runtime
):
    runtime.start.side_effect = RuntimeError("failed with " + RUN_TOKEN)

    response = client.post(
        f"/v1/runs/{RUN_ID}/start",
        json={"run_token": RUN_TOKEN, "worker_image": WORKER_IMAGE},
        headers=_headers(),
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Docker lifecycle unavailable"}
    assert RUN_TOKEN not in response.text
