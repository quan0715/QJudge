from __future__ import annotations

import base64
import asyncio
import json
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient
import pytest

from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.worker.app import create_app
from integrity_service.worker.backend_client import (
    BackendClient,
    BackendProtocolError,
    BackendUnavailable,
)
from integrity_service.worker.runtime import WorkerRuntime
from integrity_service.worker.settings import WorkerBootstrap

from test_registry import registry_snapshot


RUN_ID = UUID("00000000-0000-0000-0000-000000000901")
NOW_SECONDS = 1_800_000_000
NOW_MS = NOW_SECONDS * 1_000


class FakeBackend:
    def __init__(self) -> None:
        self.failures_remaining = 0
        self.command_batches: list[tuple[dict[str, object], ...]] = []
        self.objects: dict[str, bytes] = {}
        self.fail_upload = False
        self.delivered = asyncio.Event()

    def send_commands(
        self, commands: tuple[dict[str, object], ...]
    ) -> dict[str, object]:
        self.command_batches.append(commands)
        if self.failures_remaining:
            self.failures_remaining -= 1
            raise BackendUnavailable("temporarily unavailable")
        if any(item["kind"] == "auto_submit" for item in commands):
            self.delivered.set()
        return {
            "accepted_command_ids": [item["command_id"] for item in commands],
            "archive_uploads": [
                {
                    "command_id": item["command_id"],
                    "object_key": item["metadata"]["object_key"],
                    "upload_url": "memory://" + item["metadata"]["object_key"],
                }
                for item in commands
                if item["kind"] == "create_archive_upload"
            ],
        }

    def upload_presigned(self, url: str, content: bytes, sha256: str) -> None:
        if self.fail_upload:
            self.fail_upload = False
            raise BackendUnavailable("storage unavailable")
        self.objects[url.removeprefix("memory://")] = content


def bootstrap(public_key_b64: str) -> WorkerBootstrap:
    return WorkerBootstrap(
        run_id=RUN_ID,
        contest_id=17,
        server_ms=NOW_MS,
        scheduled_end_ms=NOW_MS + 10_000,
        active_participant_ids=(101, 202),
        submitted_participant_ids=(202,),
        policy_snapshot={
            "suspect_after_ms": 15_000,
            "disconnected_after_ms": 60_000,
        },
        registry_snapshot=registry_snapshot(),
        backend_signing_public_key_b64=public_key_b64,
        archive_policy={"capacity_warning_bytes": 32 * 1024 * 1024},
        generation=3,
    )


def batch_payload(
    *,
    batch_id: UUID | None = None,
    event_type: str = "exit_fullscreen_triggered",
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    return EventBatch(
        schema_version=1,
        batch_id=batch_id or uuid4(),
        run_id=RUN_ID,
        participant_id=101,
        device_id="device-a",
        registry_version="registry-v2",
        first_seq=1,
        last_seq=1,
        records=[
            EventRecord(
                event_id=uuid4(),
                seq=1,
                kind="event",
                event_type=event_type,
                event_schema_version=1,
                client_occurred_at_ms=123,
                client_recorded_at_ms=124,
                monotonic_ms=125.0,
                payload={"reason": "test"} if payload is None else payload,
            )
        ],
        client_build="worker-test",
    ).model_dump(mode="json")


def signed_headers(
    private_key: Ed25519PrivateKey,
    body: bytes,
    *,
    run_id: UUID = RUN_ID,
    timestamp: int = NOW_SECONDS,
) -> dict[str, str]:
    timestamp_text = str(timestamp)
    message = (
        str(run_id).encode("ascii")
        + b"\n"
        + timestamp_text.encode("ascii")
        + b"\n"
        + body
    )
    return {
        "content-type": "application/json",
        "X-QJudge-Run-Id": str(run_id),
        "X-QJudge-Timestamp": timestamp_text,
        "X-QJudge-Signature": base64.b64encode(private_key.sign(message)).decode("ascii"),
    }


def make_client(tmp_path: Path):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    backend = FakeBackend()
    runtime = WorkerRuntime(
        bootstrap=bootstrap(base64.b64encode(public_key).decode("ascii")),
        data_root=tmp_path,
        backend=backend,
        clock_ms=lambda: NOW_MS,
    )
    app = create_app(
        runtime=runtime,
        now_seconds=lambda: NOW_SECONDS,
        start_scheduler=False,
    )
    return TestClient(app), runtime, backend, private_key


def post_batch(client: TestClient, private_key: Ed25519PrivateKey, payload):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return client.post(
        f"/v1/runs/{RUN_ID}/batches",
        content=body,
        headers=signed_headers(private_key, body),
    )


def test_signature_errors_run_mismatch_and_staleness_never_mutate_journal(tmp_path):
    client, runtime, _, private_key = make_client(tmp_path)
    payload = batch_payload()
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    endpoint = f"/v1/runs/{RUN_ID}/batches"

    invalid = signed_headers(private_key, body)
    invalid["X-QJudge-Signature"] = base64.b64encode(b"x" * 64).decode("ascii")
    assert client.post(endpoint, content=body, headers=invalid).status_code == 401

    other_run = uuid4()
    mismatch = signed_headers(private_key, body, run_id=other_run)
    assert client.post(endpoint, content=body, headers=mismatch).status_code == 401

    stale = signed_headers(private_key, body, timestamp=NOW_SECONDS - 31)
    assert client.post(endpoint, content=body, headers=stale).status_code == 401

    # Task 4 intentionally forbids a second recovery reader while the writer owns its lock.
    assert runtime.journal.recovered_batches == ()


def test_batch_ack_requires_raw_timeline_outbox_and_backend_durability(tmp_path):
    client, runtime, backend, private_key = make_client(tmp_path)

    response = post_batch(client, private_key, batch_payload())

    assert response.status_code == 200
    assert response.json()["acked_through_seq"] == 1
    assert len(runtime.journal.recovered_batches) == 1
    receipt = runtime.timeline_journal.records[-1]
    assert receipt["kind"] == "batch_receipt"
    assert receipt["server_ms"] == NOW_MS
    assert receipt["timeline_seq"] == 1
    assert len(receipt["records"]) == 1
    assert runtime.outbox.pending_commands == ()
    assert backend.command_batches


def test_journal_failure_returns_507_without_ack_and_marks_unhealthy(tmp_path, monkeypatch):
    client, runtime, _, private_key = make_client(tmp_path)

    def fail(_batch):
        raise OSError("disk full")

    monkeypatch.setattr(runtime.journal, "append_batch_once", fail)
    response = post_batch(client, private_key, batch_payload())

    assert response.status_code == 507
    assert "acked_through_seq" not in response.json()
    assert runtime.healthy is False


def test_backend_failure_retries_the_same_durable_commands_before_new_processing(tmp_path):
    client, runtime, backend, private_key = make_client(tmp_path)
    payload = batch_payload()
    backend.failures_remaining = 1

    first = post_batch(client, private_key, payload)
    second = post_batch(client, private_key, payload)

    assert first.status_code == 503
    assert second.status_code == 200
    assert backend.command_batches[0] == backend.command_batches[1]
    assert runtime.timeline_journal.records[-1]["records"] == []
    assert runtime.timeline_journal.records[-1]["timeline_seq"] == 2


def test_unknown_signal_is_raw_journaled_ackable_and_deterministically_warned(tmp_path):
    client, runtime, backend, private_key = make_client(tmp_path)
    payload = batch_payload(event_type="future_detector_signal", payload={"x": 1})

    response = post_batch(client, private_key, payload)

    assert response.status_code == 200
    assert runtime.journal.recovered_batches[0].records[
        0
    ].event_type == "future_detector_signal"
    warnings = [
        command
        for sent in backend.command_batches
        for command in sent
        if command["event_type"] == "unknown_signal"
    ]
    assert len(warnings) == 1
    assert warnings[0]["metadata"]["code"] == "unknown_signal"
    assert "unknown_signal" in runtime.warning_codes


def test_invalid_payload_is_raw_journaled_and_warned_without_semantic_command(tmp_path):
    client, runtime, backend, private_key = make_client(tmp_path)
    payload = batch_payload(payload={"unexpected": True})

    response = post_batch(client, private_key, payload)

    assert response.status_code == 200
    assert runtime.timeline_journal.records[-1]["records"][0]["payload"] == {
        "unexpected": True
    }
    commands = [command for sent in backend.command_batches for command in sent]
    assert [command["event_type"] for command in commands] == ["invalid_payload"]
    assert "invalid_payload" in runtime.warning_codes


def test_frozen_policy_delayed_ids_are_durable_and_audit_only(tmp_path):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = bootstrap(base64.b64encode(public_key).decode("ascii"))
    frozen.policy_snapshot["delayed_delivery_after_ms"] = 500
    backend = FakeBackend()
    runtime = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=backend,
        clock_ms=lambda: NOW_MS,
    )
    payload = EventBatch.model_validate(batch_payload())
    payload.records[0].client_recorded_at_ms = NOW_MS - 1_000

    runtime.ingest(payload, NOW_MS)

    assert runtime.timeline_journal.records[-1]["delayed_event_ids"] == [
        str(payload.records[0].event_id)
    ]
    event = [
        command
        for sent in backend.command_batches
        for command in sent
        if command["kind"] == "record_event"
    ][0]
    assert event["delayed_delivery"] is True
    assert event["action"] == "audit"


def test_idle_tick_auto_submits_only_active_unsubmitted_participants(tmp_path):
    _, runtime, backend, _ = make_client(tmp_path)

    runtime.tick(NOW_MS + 10_000)
    runtime.tick(NOW_MS + 20_000)

    submitted = [
        command["participant_id"]
        for sent in backend.command_batches
        for command in sent
        if command["kind"] == "auto_submit"
    ]
    assert submitted == [101]
    assert runtime.accepting is True


def test_stop_seals_uploads_and_returns_verified_manifest(tmp_path):
    client, runtime, _, private_key = make_client(tmp_path)
    assert post_batch(client, private_key, batch_payload()).status_code == 200
    body = b""

    response = client.post(
        f"/v1/runs/{RUN_ID}/control/stop",
        content=body,
        headers=signed_headers(private_key, body),
    )

    assert response.status_code == 200
    assert response.json()["archived"] is True
    assert len(response.json()["manifest_sha256"]) == 64
    assert runtime.accepting is False


def test_timeline_append_failure_is_unhealthy_and_cannot_skip_semantics_on_retry(
    tmp_path, monkeypatch
):
    _, runtime, _, _ = make_client(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    real_append = runtime.timeline_journal._log.append

    def fail_once(_record):
        raise OSError("timeline fsync failed")

    monkeypatch.setattr(runtime.timeline_journal._log, "append", fail_once)
    with pytest.raises(OSError, match="timeline fsync"):
        runtime.ingest(payload, NOW_MS)
    monkeypatch.setattr(runtime.timeline_journal._log, "append", real_append)

    assert runtime.healthy is False
    with pytest.raises(OSError, match="unhealthy"):
        runtime.ingest(payload, NOW_MS + 1)


def test_recovery_replays_exact_receipt_and_resends_pending_commands(tmp_path):
    _, runtime, backend, _ = make_client(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    backend.failures_remaining = 1
    with pytest.raises(BackendUnavailable):
        runtime.ingest(payload, NOW_MS)
    first_pending = runtime.outbox.pending_commands
    runtime.close()

    recovered_backend = FakeBackend()
    recovered = WorkerRuntime(
        bootstrap=runtime.bootstrap,
        data_root=tmp_path,
        backend=recovered_backend,
        clock_ms=lambda: NOW_MS + 1,
    )
    assert recovered.outbox.pending_commands == first_pending

    ack = recovered.ingest(payload, NOW_MS + 1)

    assert ack.acked_through_seq == 1
    assert recovered_backend.command_batches[0] == first_pending
    assert recovered.timeline_journal.records[-1]["records"] == []


@pytest.mark.asyncio
async def test_single_idle_scheduler_loop_advances_authoritative_time(tmp_path):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    now = [NOW_MS]
    release = asyncio.Event()

    async def wait_for_tick() -> None:
        await release.wait()
        release.clear()

    backend = FakeBackend()
    runtime = WorkerRuntime(
        bootstrap=bootstrap(base64.b64encode(public_key).decode("ascii")),
        data_root=tmp_path,
        backend=backend,
        clock_ms=lambda: now[0],
        scheduler_wait=wait_for_tick,
    )
    await runtime.start_scheduler()
    first_task = runtime._scheduler_task
    await runtime.start_scheduler()
    assert runtime._scheduler_task is first_task

    now[0] = NOW_MS + 10_000
    release.set()
    await asyncio.wait_for(backend.delivered.wait(), timeout=1)
    await runtime.stop_scheduler()

    submitted = [
        command["participant_id"]
        for sent in backend.command_batches
        for command in sent
        if command["kind"] == "auto_submit"
    ]
    assert submitted == [101]
    assert runtime.accepting is True


@pytest.mark.asyncio
async def test_scheduler_start_immediately_drains_recovered_outbox(tmp_path):
    _, runtime, backend, _ = make_client(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    backend.failures_remaining = 1
    with pytest.raises(BackendUnavailable):
        runtime.ingest(payload, NOW_MS)
    pending = runtime.outbox.pending_commands
    runtime.close()

    async def never_tick() -> None:
        await asyncio.Event().wait()

    recovered_backend = FakeBackend()
    recovered = WorkerRuntime(
        bootstrap=runtime.bootstrap,
        data_root=tmp_path,
        backend=recovered_backend,
        clock_ms=lambda: NOW_MS,
        scheduler_wait=never_tick,
    )
    await recovered.start_scheduler()
    await recovered.stop_scheduler()

    assert recovered_backend.command_batches == [pending]
    assert recovered.outbox.pending_commands == ()


def test_runtime_owns_an_immutable_copy_of_delayed_delivery_policy(tmp_path):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = bootstrap(base64.b64encode(public_key).decode("ascii"))
    frozen.policy_snapshot["delayed_delivery_after_ms"] = 500
    backend = FakeBackend()
    runtime = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=backend,
        clock_ms=lambda: NOW_MS,
    )
    frozen.policy_snapshot["delayed_delivery_after_ms"] = 0
    payload = EventBatch.model_validate(batch_payload())
    payload.records[0].client_recorded_at_ms = NOW_MS - 100

    runtime.ingest(payload, NOW_MS)

    assert runtime.timeline_journal.records[-1]["delayed_event_ids"] == []


def test_stop_archive_failure_remains_stopping_without_success_result(tmp_path):
    _, runtime, backend, _ = make_client(tmp_path)
    runtime.ingest(EventBatch.model_validate(batch_payload()), NOW_MS)
    backend.fail_upload = True

    with pytest.raises(Exception, match="archive upload"):
        runtime.stop()

    assert runtime.state == "STOPPING"
    assert runtime.accepting is False


def test_submission_append_failure_poison_runtime_before_timeline_apply(
    tmp_path, monkeypatch
):
    _, runtime, _, _ = make_client(tmp_path)

    def fail(_record):
        raise OSError("submission timeline fsync failed")

    monkeypatch.setattr(runtime.timeline_journal._log, "append", fail)
    with pytest.raises(OSError, match="submission timeline"):
        runtime.record_submission(
            participant_id=101,
            source="backend",
            server_ms=NOW_MS + 1,
        )

    assert runtime.healthy is False
    assert runtime.submissions.is_submitted(101) is False


def test_backend_client_retries_only_retryable_status_with_identical_command_bytes():
    bodies: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.content)
        assert request.headers["Authorization"] == "Bearer scoped-token"
        status = 503 if len(bodies) == 1 else 200
        return httpx.Response(status, json={"accepted_command_ids": ["id"]})

    client = BackendClient(
        base_url="https://backend.example",
        run_id=RUN_ID,
        token="scoped-token",
        transport=httpx.MockTransport(handler),
    )
    command = {
        "command_id": str(uuid4()),
        "kind": "update_run_checkpoint",
        "metadata": {},
    }

    client.send_commands((command,))

    assert bodies[0] == bodies[1]
    assert command["command_id"].encode("ascii") in bodies[0]


def test_backend_client_does_not_retry_nonretryable_status_or_manufacture_ids():
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500, json={"detail": "no"})

    client = BackendClient(
        base_url="https://backend.example",
        run_id=RUN_ID,
        token="scoped-token",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(ValueError, match="command_id"):
        client.send_commands(({"kind": "update_run_checkpoint"},))
    with pytest.raises(BackendProtocolError):
        client.send_commands(
            (
                {
                    "command_id": str(uuid4()),
                    "kind": "update_run_checkpoint",
                },
            )
        )
    assert calls == 1
