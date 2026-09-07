import base64
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient
import pytest
import httpx

from integrity_service.resident.app import create_app
from integrity_service.resident.registry import RunRegistry
from test_resident_registry import descriptor
from test_runtime_engine import FakeBackend, NOW_MS, NOW_SECONDS, batch_payload


def sign(key, method, path, run_id, revision, body):
    message = f"resident-v1\n{method}\n{path}\n{run_id}\n{revision}\n{NOW_SECONDS}\n".encode() + body
    return {"X-QJudge-Protocol": "resident-v1", "X-QJudge-Run-Id": str(run_id),
            "X-QJudge-Revision": str(revision), "X-QJudge-Timestamp": str(NOW_SECONDS),
            "X-QJudge-Signature": base64.b64encode(key.sign(message)).decode()}


@pytest.fixture
def setup(tmp_path):
    key = Ed25519PrivateKey.generate()
    public_b64 = base64.b64encode(key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
    d = descriptor()
    d = replace(d, bootstrap=replace(d.bootstrap, backend_signing_public_key_b64=public_b64))
    registry = RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend())
    app = create_app(registry=registry, public_key=key.public_key(), now_ms=lambda: NOW_MS, start_maintenance=False)
    with TestClient(app) as client:
        yield key, d, registry, client


def put(client, key, d, *, path=None, revision=None):
    path = path or f"/v1/runs/{d.bootstrap.run_id}"
    body = json.dumps(d.to_payload()).encode()
    return client.put(path, content=body, headers=sign(key, "PUT", path, d.bootstrap.run_id, revision or d.schedule_revision, body))


def test_finalize_signed_scope_and_separate_bounded_archive_lane(setup, monkeypatch):
    from integrity_service.journal.archive import ArchiveResult
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    entered, release = threading.Event(), threading.Event()
    def finalize(*_):
        entered.set()
        assert release.wait(5)
        return ArchiveResult(False, "", "")
    monkeypatch.setattr(registry, "finalize", finalize)
    path = f"/v1/runs/{d.bootstrap.run_id}/control/finalize"
    body = b'{"expected_revision":1}'
    headers = sign(key, "POST", path, d.bootstrap.run_id, 1, body)
    assert client.post(path, content=body + b" ", headers=headers).status_code == 401
    for invalid in (b"not-json", b'{"expected_revision":true}'):
        result = client.post(path, content=invalid, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, invalid))
        assert result.status_code in (409, 422)
    try:
        assert client.post(path, content=body, headers=headers).status_code == 202
        assert entered.wait(2)
        assert client.post(path, content=body, headers=headers).status_code == 503
        assert put(client, key, replace(d, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000)).status_code == 200
    finally:
        release.set()


def test_trusted_gap_precedes_resumed_receipt_and_duplicate_handoff_is_durable(setup):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    path = f"/v1/runs/{d.bootstrap.run_id}/batches"
    gap = {"generation": 1, "started_ms": NOW_MS - 10, "ended_ms": NOW_MS, "reason": "platform_unavailable"}
    body = json.dumps({"batch": batch_payload(), "late_unverified": False, "service_gap": gap}).encode()
    headers = sign(key, "POST", path, d.bootstrap.run_id, 1, body)
    response = client.post(path, content=body, headers=headers)
    assert response.status_code == 200
    assert response.headers["X-QJudge-Gap-Generation"] == "1"
    assert client.post(path, content=body, headers=headers).status_code == 200
    runtime = registry.get(d.bootstrap.run_id)
    assert runtime.health_snapshot().service_gap_count == 1
    runtime.process_pending(1)
    kinds = [r["kind"] for r in runtime.timeline_journal.records]
    assert kinds.index("service_gap") < kinds.index("batch_receipt")


def test_network_recovery_signed_handoff_suppresses_resumed_decision_without_restart(setup, monkeypatch):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    runtime = registry.get(d.bootstrap.run_id)
    from integrity_service.core.schemas import EventBatch
    runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
    runtime.process_pending(1)
    old_now = NOW_MS
    monkeypatch.setattr("test_resident_api.NOW_MS", old_now + 200000)
    monkeypatch.setattr("test_resident_api.NOW_SECONDS", (old_now + 200000) // 1000)
    batch = batch_payload()
    batch["first_seq"] = batch["last_seq"] = batch["records"][0]["seq"] = 2
    body = json.dumps({"batch": batch, "late_unverified": False,
        "service_gap": {"generation": 1, "started_ms": old_now + 1, "ended_ms": old_now + 200000,
                        "reason": "platform_unavailable"}}).encode()
    path = f"/v1/runs/{d.bootstrap.run_id}/batches"
    assert client.post(path, content=body, headers=sign(key, "POST", path, runtime.run_id, 1, body)).status_code == 200
    runtime.process_pending(1)
    assert len(runtime.outbox.suppressed_commands) == 2
    assert registry.get(runtime.run_id) is runtime


def test_authenticates_before_creating_any_run_and_binds_all_control_fields(setup, tmp_path):
    key, d, registry, client = setup
    path = f"/v1/runs/{d.bootstrap.run_id}"
    body = json.dumps(d.to_payload()).encode()
    headers = sign(key, "PUT", path, d.bootstrap.run_id, 1, body)
    assert client.put(path, content=body + b" ", headers=headers).status_code == 401
    assert client.post(path + "/batches", content=body, headers=headers).status_code == 401
    assert client.put(path, content=body, headers={**headers, "X-QJudge-Revision": "2"}).status_code == 401
    assert registry.run_ids() == ()
    assert not (tmp_path / str(d.bootstrap.run_id)).exists()
    assert put(client, key, d).status_code == 200
    assert put(client, key, replace(d, schedule_revision=2, scheduled_end_ms=NOW_MS + 20000)).status_code == 200
    assert put(client, key, d).status_code == 409


def test_cross_run_body_and_unsigned_protocol_rejected(setup):
    key, d, registry, client = setup
    other = uuid4()
    path = f"/v1/runs/{other}"
    body = json.dumps(d.to_payload()).encode()
    assert client.put(path, content=body, headers=sign(key, "PUT", path, other, 1, body)).status_code == 409
    assert registry.run_ids() == ()
    headers = sign(key, "PUT", path, other, 1, body)
    headers.pop("X-QJudge-Protocol")
    assert client.put(path, content=body, headers=headers).status_code == 401


def test_batch_ack_is_explicit_durable_receipt_and_unknown_run_never_bootstraps(setup):
    key, d, registry, client = setup
    path = f"/v1/runs/{d.bootstrap.run_id}/batches"
    body = json.dumps(batch_payload()).encode()
    headers = sign(key, "POST", path, d.bootstrap.run_id, 1, body)
    assert client.post(path, content=body, headers=headers).status_code == 404
    assert put(client, key, d).status_code == 200
    result = client.post(path, content=body, headers=headers)
    assert result.status_code == 200
    assert result.headers["X-QJudge-Protocol"] == "resident-v1"
    assert result.json()["acked_through_seq"] == 1
    assert registry.get(d.bootstrap.run_id).receipts.processed_cursor == 0
    assert client.get("/live").status_code == 200
    assert client.get("/ready").status_code == 200


def test_terminal_session_stops_receipts(setup):
    key, d, registry, client = setup
    assert put(client, key, replace(d, session_state="closed")).status_code == 200
    path = f"/v1/runs/{d.bootstrap.run_id}/batches"
    body = json.dumps(batch_payload()).encode()
    assert client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body)).status_code == 409
    health = f"/v1/runs/{d.bootstrap.run_id}/health"
    response = client.get(health, headers=sign(key, "GET", health, d.bootstrap.run_id, 1, b""))
    assert response.json()["accepting"] is False


def test_health_exposes_gap_history_separately_from_process_health(setup):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    runtime = registry.get(d.bootstrap.run_id)
    runtime.record_service_gap(NOW_MS, NOW_MS + 100, "platform_unavailable")
    path = f"/v1/runs/{d.bootstrap.run_id}/health"
    response = client.get(path, headers=sign(key, "GET", path, d.bootstrap.run_id, 1, b""))
    assert response.status_code == 200
    assert response.json().get("service_gaps") == {"count": 1,
        "last_ended_ms": NOW_MS + 100, "suppressed_connectivity_commands": 0,
        "affected_participant_count": 0}


def test_signed_student_progress_distinguishes_receipt_from_decision(setup):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    batch = batch_payload()
    path = f"/v1/runs/{d.bootstrap.run_id}/batches"
    body = json.dumps(batch).encode()
    assert client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body)).status_code == 200
    path = f"/v1/runs/{d.bootstrap.run_id}/progress"
    scope = json.dumps({"participant_id": batch["participant_id"], "device_id": batch["device_id"]}).encode()
    headers = sign(key, "POST", path, d.bootstrap.run_id, 1, scope)
    response = client.post(path, content=scope, headers=headers)
    assert response.status_code == 200
    assert response.json()["received_seq"] == 1
    assert response.json()["processed_seq"] == 0
    registry.get(d.bootstrap.run_id).process_pending(10)
    response = client.post(path, content=scope, headers=headers)
    assert response.json()["processed_seq"] == 1
    assert response.json()["participant_id"] == batch["participant_id"]
    assert client.post(path, content=scope + b" ", headers=headers).status_code == 401


def test_signed_fence_scope_and_progress(setup):
    from test_evidence_fence import fenced, ATTEMPT
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    path = f"/v1/runs/{d.bootstrap.run_id}/batches"
    body = json.dumps({"batch": fenced(1, 123000), "late_unverified": False, "attempt_id": str(ATTEMPT)}).encode()
    response = client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body))
    assert response.status_code == 200
    registry.get(d.bootstrap.run_id).process_pending(1)
    path = f"/v1/runs/{d.bootstrap.run_id}/progress"
    body = json.dumps({"participant_id": 101, "device_id": "device-a", "attempt_id": str(ATTEMPT)}).encode()
    response = client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body))
    assert response.status_code == 200
    assert response.json()["release_evidence_before_ms"] == 123000
    assert response.json()["evidence_fence_version"] == "resident-evidence-fence-v1"


def test_late_envelope_is_durable_raw_only_and_retry_keeps_original_disposition(setup):
    key, d, registry, client = setup
    assert put(client, key, d).status_code == 200
    batch = batch_payload()
    path = f"/v1/runs/{d.bootstrap.run_id}/batches"
    body = json.dumps({"batch": batch, "late_unverified": True}).encode()
    response = client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body))
    assert response.status_code == 200
    runtime = registry.get(d.bootstrap.run_id)
    original = runtime.receipts.receipt_at(1)
    assert original.late_unverified
    runtime.process_pending(10)
    assert runtime.outbox.pending_commands == ()
    body = json.dumps({"batch": batch, "late_unverified": False}).encode()
    assert client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body)).status_code == 200
    assert runtime.receipts.receipt_at(1) == original


def test_backend_client_verifies_recovery_descriptors_and_rotates_file_credential():
    from integrity_service.worker.backend_client import BackendClient, BackendProtocolError
    key = Ed25519PrivateKey.generate()
    d = descriptor()
    body = json.dumps(d.to_payload())
    headers = sign(key, "PUT", f"/v1/runs/{d.bootstrap.run_id}", d.bootstrap.run_id, 1, body.encode())
    credential = ["first"]
    observed = []
    def response(request):
        observed.append(request.headers["Authorization"])
        return httpx.Response(200, json={"descriptors": [{"body": body, "headers": headers}]})
    client = BackendClient(base_url="http://backend", run_id=d.bootstrap.run_id, token="first",
                           credential_provider=lambda: credential[0], transport=httpx.MockTransport(response))
    try:
        assert client.fetch_resident_descriptors(key.public_key(), now_seconds=NOW_SECONDS) == [d.to_payload()]
        credential[0] = "second"
        assert client.fetch_resident_descriptors(key.public_key(), now_seconds=NOW_SECONDS) == [d.to_payload()]
        assert observed == ["Resident first", "Resident second"]
        headers["X-QJudge-Revision"] = "2"
        with pytest.raises(BackendProtocolError):
            client.fetch_resident_descriptors(key.public_key(), now_seconds=NOW_SECONDS)
    finally:
        client.close()


def test_http_admission_is_per_run_and_retryable_without_unbounded_queue(setup, monkeypatch):
    key, d, registry, client = setup
    put(client, key, d)
    second = replace(d, bootstrap=replace(d.bootstrap, run_id=uuid4()))
    put(client, key, second)
    entered, release = threading.Event(), threading.Event()
    runtime = registry.get(d.bootstrap.run_id)
    accept = runtime.accept_batch
    def blocked(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return accept(*args, **kwargs)
    monkeypatch.setattr(runtime, "accept_batch", blocked)
    def send(descriptor):
        path = f"/v1/runs/{descriptor.bootstrap.run_id}/batches"
        payload = batch_payload()
        payload["run_id"] = str(descriptor.bootstrap.run_id)
        body = json.dumps(payload).encode()
        return client.post(path, content=body, headers=sign(key, "POST", path, descriptor.bootstrap.run_id, 1, body))
    with ThreadPoolExecutor(2) as pool:
        first = pool.submit(send, d)
        try:
            assert entered.wait(2)
            response = send(d)
            assert response.status_code == 503
            assert response.headers["Retry-After"] == "1"
            assert pool.submit(send, second).result(timeout=2).status_code == 200
        finally:
            release.set()
            assert first.result(timeout=2).status_code == 200


def test_body_stream_cap_does_not_trust_content_length(setup):
    key, d, registry, client = setup
    path = f"/v1/runs/{d.bootstrap.run_id}"
    response = client.put(path, content=(b"x" * (1024 * 1024), b"x"), headers={"Content-Length": "1"})
    assert response.status_code == 413
    assert registry.run_ids() == ()


@pytest.mark.parametrize("limit,status", [("pending", 503), ("storage", 507)])
def test_run_admission_stops_before_ack_when_backlog_or_storage_full(tmp_path, limit, status):
    from integrity_service.resident.settings import ResidentSettings
    key = Ed25519PrivateKey.generate()
    registry = RunRegistry(root=tmp_path, backend_factory=lambda _: FakeBackend())
    d = descriptor()
    registry.ensure(d)
    settings = ResidentSettings(tmp_path, "", tmp_path / "unused", tmp_path / "unused",
        max_pending_receipts=1, max_run_bytes=1 if limit == "storage" else 1024 * 1024)
    app = create_app(registry=registry, public_key=key.public_key(), settings=settings, now_ms=lambda: NOW_MS, start_maintenance=False)
    with TestClient(app) as client:
        path = f"/v1/runs/{d.bootstrap.run_id}/batches"
        body = json.dumps(batch_payload()).encode()
        if limit == "pending":
            assert client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body)).status_code == 200
            body = json.dumps(batch_payload(participant_id=202)).encode()
        response = client.post(path, content=body, headers=sign(key, "POST", path, d.bootstrap.run_id, 1, body))
        assert response.status_code == status
        assert len(registry.get(d.bootstrap.run_id).receipts.pending()) == (1 if limit == "pending" else 0)


def purge(client, key, d, *, revision=None):
    run_id = d.bootstrap.run_id
    revision = revision or d.schedule_revision
    path = f"/v1/runs/{run_id}/control/purge"
    body = json.dumps({"expected_revision": revision}, separators=(",", ":")).encode()
    return client.post(path, content=body, headers=sign(key, "POST", path, run_id, revision, body))


def test_purge_refuses_a_loaded_run_and_removes_a_retired_one(setup, tmp_path):
    key, d, registry, client = setup
    run_id = d.bootstrap.run_id
    assert put(client, key, d).status_code == 200
    batch_path = f"/v1/runs/{run_id}/batches"
    batch_body = json.dumps(batch_payload()).encode()
    assert client.post(batch_path, content=batch_body,
        headers=sign(key, "POST", batch_path, run_id, 1, batch_body)).status_code == 200
    directory = tmp_path / str(run_id)
    assert directory.is_dir()

    # A Run still serving an exam must never lose its durable receipts.
    assert purge(client, key, d).status_code == 409
    assert directory.is_dir()

    # Finalization retires the Run; only then may its volume be reclaimed.
    registry._runtimes.pop(run_id).close()
    response = purge(client, key, d)
    assert response.status_code == 200
    assert response.json()["purged"] is True
    assert response.json()["removed"] is True
    assert response.headers["X-QJudge-Protocol"] == "resident-v1"
    assert not directory.exists()


def test_purge_is_idempotent_and_rejects_unsigned_or_stale_revision(setup):
    key, d, registry, client = setup
    run_id = d.bootstrap.run_id
    assert put(client, key, d).status_code == 200
    registry._runtimes.pop(run_id).close()

    assert purge(client, key, d).status_code == 200
    # Repeating a completed purge stays terminal rather than erroring.
    repeat = purge(client, key, d)
    assert repeat.status_code == 200
    assert repeat.json()["removed"] is False

    path = f"/v1/runs/{run_id}/control/purge"
    body = json.dumps({"expected_revision": 1}, separators=(",", ":")).encode()
    assert client.post(path, content=body).status_code == 401
    stale = json.dumps({"expected_revision": 2}, separators=(",", ":")).encode()
    assert client.post(path, content=stale,
        headers=sign(key, "POST", path, run_id, 1, stale)).status_code == 409
