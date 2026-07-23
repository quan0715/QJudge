from __future__ import annotations

import base64
import asyncio
import json
import os
from dataclasses import replace
from pathlib import Path
import stat
import threading
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
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
from integrity_service.journal.archive import ArchiveFatalFailure
from integrity_service.journal.command_outbox import DurableLogCorruption

from test_registry import registry_snapshot


RUN_ID = UUID("00000000-0000-0000-0000-000000000901")
NOW_SECONDS = 1_800_000_000
NOW_MS = NOW_SECONDS * 1_000
VALID_PUBLIC_KEY_B64 = base64.b64encode(bytes(range(32))).decode("ascii")


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
                    "checksum_sha256": item["metadata"]["sha256"],
                    "checksum_enforced": True,
                }
                for item in commands
                if item["kind"] == "create_archive_upload"
            ],
        }

    def upload_presigned(
        self,
        url: str,
        content: bytes,
        sha256: str,
        content_type: str,
    ) -> None:
        if self.fail_upload:
            self.fail_upload = False
            raise BackendUnavailable("storage unavailable")
        self.objects[url.removeprefix("memory://")] = content


class FixedResponseBackend(FakeBackend):
    def __init__(self, response: object) -> None:
        super().__init__()
        self.response = response

    def send_commands(self, commands):
        self.command_batches.append(commands)
        return self.response


def bootstrap(public_key_b64: str) -> WorkerBootstrap:
    return WorkerBootstrap(
        run_id=RUN_ID,
        contest_id=UUID("17171717-1717-1717-1717-171717171717"),
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
        generation=1,
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


def _durable_tree(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file()
    }


def test_signed_cross_run_batch_cannot_touch_the_resolved_runtime(tmp_path):
    client, runtime, backend, private_key = make_client(tmp_path)
    payload = batch_payload()
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    other_run = uuid4()
    before = _durable_tree(tmp_path)

    response = client.post(
        f"/v1/runs/{other_run}/batches",
        content=body,
        headers=signed_headers(private_key, body, run_id=other_run),
    )

    assert response.status_code == 401
    assert _durable_tree(tmp_path) == before
    assert runtime.journal.recovered_batches == ()
    assert runtime.outbox.pending_commands == ()
    assert backend.command_batches == []
    assert runtime.accepting is True
    assert runtime.state == "RUNNING"


def test_signed_cross_run_stop_cannot_touch_scheduler_or_archive(tmp_path):
    _, runtime, backend, private_key = make_client(tmp_path)
    other_run = uuid4()
    application = create_app(
        runtime=runtime,
        now_seconds=lambda: NOW_SECONDS,
        start_scheduler=True,
    )

    with TestClient(application) as client:
        scheduler_task = runtime._scheduler_task
        assert scheduler_task is not None
        before = _durable_tree(tmp_path)

        response = client.post(
            f"/v1/runs/{other_run}/control/stop",
            content=b"",
            headers=signed_headers(private_key, b"", run_id=other_run),
        )

        assert response.status_code == 401
        assert _durable_tree(tmp_path) == before
        assert runtime.accepting is True
        assert runtime.state == "RUNNING"
        assert runtime._scheduler_task is scheduler_task
        assert scheduler_task.done() is False
        assert runtime.outbox.pending_commands == ()
        assert backend.command_batches == []


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


def test_new_batch_is_raw_durable_before_old_command_delivery_can_block(tmp_path):
    _, runtime, backend, _ = make_client(tmp_path)
    first = EventBatch.model_validate(batch_payload())
    backend.failures_remaining = 1
    with pytest.raises(BackendUnavailable):
        runtime.ingest(first, NOW_MS)

    second = EventBatch.model_validate(batch_payload())
    second.batch_id = uuid4()
    second.first_seq = 2
    second.last_seq = 2
    second.records[0].event_id = uuid4()
    second.records[0].seq = 2
    backend.failures_remaining = 1

    with pytest.raises(BackendUnavailable):
        runtime.ingest(second, NOW_MS + 1)

    assert runtime.journal.recovered_batches == (first, second)


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
    frozen = replace(
        frozen,
        policy_snapshot={
            **dict(frozen.policy_snapshot),
            "delayed_delivery_after_ms": 500,
        },
    )
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


def test_backwards_receipt_context_fails_fresh_process_closed(tmp_path):
    _, runtime, _, _ = make_client(tmp_path)
    payload = EventBatch.model_validate(batch_payload())

    with pytest.raises(ValueError, match="backwards"):
        runtime.ingest(payload, NOW_MS - 1)

    assert runtime.journal.recovered_batches == (payload,)
    assert runtime.healthy is False
    with pytest.raises(OSError, match="unhealthy"):
        runtime.ingest(payload, NOW_MS)
    runtime.close()

    with pytest.raises(DurableLogCorruption, match="conflicts with replay"):
        WorkerRuntime(
            bootstrap=runtime.bootstrap,
            data_root=tmp_path,
            backend=FakeBackend(),
            clock_ms=lambda: NOW_MS,
        )


def test_fresh_process_reconstructs_unmatched_raw_without_browser_retry(
    tmp_path, monkeypatch
):
    _, runtime, _, _ = make_client(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    real_append = runtime.timeline_journal.append_receipt

    def fail_receipt(*_args, **_kwargs):
        raise RuntimeError("receipt projection failed")

    monkeypatch.setattr(runtime.timeline_journal, "append_receipt", fail_receipt)
    with pytest.raises(RuntimeError, match="projection"):
        runtime.ingest(payload, NOW_MS)
    monkeypatch.setattr(runtime.timeline_journal, "append_receipt", real_append)

    assert runtime.journal.recovered_batches == (payload,)
    assert runtime.healthy is False
    with pytest.raises(OSError, match="unhealthy"):
        runtime.ingest(payload, NOW_MS)
    runtime.close()

    recovered = WorkerRuntime(
        bootstrap=runtime.bootstrap,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )

    receipt = recovered.timeline_journal.records[-1]
    assert receipt["kind"] == "batch_receipt"
    assert receipt["batch_id"] == str(payload.batch_id)
    assert receipt["records"]
    assert any(
        command["kind"] == "record_event"
        for command in recovered.outbox.pending_commands
    )


def test_fresh_process_fails_closed_when_raw_has_no_receipt_context(tmp_path):
    _, runtime, _, _ = make_client(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    runtime.journal.append_batch_once(payload)
    runtime.close()

    with pytest.raises(DurableLogCorruption, match="receipt context"):
        WorkerRuntime(
            bootstrap=runtime.bootstrap,
            data_root=tmp_path,
            backend=FakeBackend(),
            clock_ms=lambda: NOW_MS,
        )


def test_post_admission_poison_disables_ingest_tick_and_archive(tmp_path, monkeypatch):
    _, runtime, backend, _ = make_client(tmp_path)
    payload = EventBatch.model_validate(batch_payload())

    def fail_outbox(_commands):
        raise OSError("outbox fsync failed")

    monkeypatch.setattr(runtime.outbox, "append", fail_outbox)
    with pytest.raises(OSError, match="outbox fsync"):
        runtime.ingest(payload, NOW_MS)

    timeline_records = runtime.timeline_journal.records
    assert runtime.healthy is False
    assert runtime.accepting is False
    assert runtime.state == "FAILED"
    runtime.tick(NOW_MS + 10_000)
    assert runtime.timeline_journal.records == timeline_records
    with pytest.raises(OSError, match="recovery"):
        runtime.stop()
    assert not any(key.endswith("manifest.json") for key in backend.objects)


@pytest.mark.asyncio
async def test_post_admission_poison_stops_an_already_running_scheduler(
    tmp_path, monkeypatch
):
    release = asyncio.Event()

    async def wait_for_tick() -> None:
        await release.wait()

    _, runtime, _, _ = make_client(tmp_path)
    runtime._scheduler_wait = wait_for_tick
    await runtime.start_scheduler()
    assert runtime._scheduler_task is not None
    scheduler_task = runtime._scheduler_task

    def fail_outbox(_commands):
        raise OSError("outbox fsync failed")

    monkeypatch.setattr(runtime.outbox, "append", fail_outbox)
    with pytest.raises(OSError, match="outbox fsync"):
        runtime.ingest(EventBatch.model_validate(batch_payload()), NOW_MS)
    timeline_records = runtime.timeline_journal.records

    release.set()
    await asyncio.wait_for(scheduler_task, timeout=1)

    assert runtime.timeline_journal.records == timeline_records
    assert runtime.accepting is False
    await runtime.stop_scheduler()


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


@pytest.mark.asyncio
async def test_scheduler_wait_failure_is_visible_unhealthy_and_observed_on_stop(tmp_path):
    async def fail_wait() -> None:
        raise RuntimeError("wait loop exploded with secret details")

    _, runtime, _, _ = make_client(tmp_path)
    runtime._scheduler_wait = fail_wait
    await runtime.start_scheduler()
    assert runtime._scheduler_task is not None
    await asyncio.wait({runtime._scheduler_task}, timeout=1)

    assert runtime.healthy is False
    assert runtime.accepting is False
    assert runtime.last_scheduler_error == "scheduler_wait_failed"
    with pytest.raises(RuntimeError, match="scheduler failed"):
        await runtime.start_scheduler()
    with pytest.raises(RuntimeError, match="scheduler failed"):
        await runtime.stop_scheduler()


@pytest.mark.asyncio
async def test_scheduler_protocol_failure_is_fatal_and_keeps_commands_pending(tmp_path):
    release = asyncio.Event()

    async def wait_for_tick() -> None:
        await release.wait()
        release.clear()

    _, runtime, _, _ = make_client(tmp_path)
    runtime._scheduler_wait = wait_for_tick
    await runtime.start_scheduler()
    runtime.backend = FixedResponseBackend(
        {"accepted_command_ids": [], "archive_uploads": []}
    )
    runtime._clock_ms = lambda: NOW_MS + 10_000
    release.set()
    assert runtime._scheduler_task is not None
    await asyncio.wait({runtime._scheduler_task}, timeout=1)

    assert runtime.healthy is False
    assert runtime.accepting is False
    assert runtime.outbox.pending_commands
    assert runtime.last_scheduler_error == "backend_protocol_error"
    with pytest.raises(RuntimeError, match="scheduler failed"):
        await runtime.stop_scheduler()


@pytest.mark.asyncio
async def test_scheduler_disk_failure_is_fatal_and_observed(tmp_path, monkeypatch):
    release = asyncio.Event()

    async def wait_for_tick() -> None:
        await release.wait()
        release.clear()

    _, runtime, _, _ = make_client(tmp_path)
    runtime._scheduler_wait = wait_for_tick

    def fail_advance(_server_ms):
        raise OSError("scheduler disk failure")

    monkeypatch.setattr(runtime.timeline_journal, "append_advance", fail_advance)
    await runtime.start_scheduler()
    release.set()
    assert runtime._scheduler_task is not None
    await asyncio.wait({runtime._scheduler_task}, timeout=1)

    assert runtime.healthy is False
    assert runtime.last_scheduler_error == "durable_write_failed"
    with pytest.raises(RuntimeError, match="scheduler failed"):
        await runtime.stop_scheduler()


@pytest.mark.asyncio
async def test_scheduler_cancellation_waits_for_inflight_command_delivery(tmp_path):
    class BlockingBackend(FakeBackend):
        def __init__(self):
            super().__init__()
            self.delivery_started = threading.Event()
            self.allow_delivery = threading.Event()
            self.delivery_finished = False

        def send_commands(self, commands):
            self.delivery_started.set()
            if not self.allow_delivery.wait(timeout=1):
                raise AssertionError("test did not release command delivery")
            response = super().send_commands(commands)
            self.delivery_finished = True
            return response

    async def immediately_tick() -> None:
        await asyncio.sleep(0)

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    backend = BlockingBackend()
    runtime = WorkerRuntime(
        bootstrap=bootstrap(base64.b64encode(public_key).decode("ascii")),
        data_root=tmp_path,
        backend=backend,
        clock_ms=lambda: NOW_MS + 10_000,
        scheduler_wait=immediately_tick,
    )
    await runtime.start_scheduler()
    assert runtime._scheduler_task is not None
    scheduler_task = runtime._scheduler_task
    loop = asyncio.get_running_loop()
    cancel_requested = threading.Event()

    def request_cancellation_during_delivery() -> None:
        if backend.delivery_started.wait(timeout=1):
            loop.call_soon_threadsafe(scheduler_task.cancel)
            cancel_requested.set()
        backend.allow_delivery.set()

    cancellation_thread = threading.Thread(
        target=request_cancellation_during_delivery
    )
    cancellation_thread.start()

    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(scheduler_task, timeout=1)

    cancellation_thread.join(timeout=1)
    assert cancellation_thread.is_alive() is False
    assert cancel_requested.is_set() is True
    assert backend.delivery_finished is True
    assert runtime.outbox.pending_commands == ()
    await runtime.stop_scheduler()


def test_runtime_owns_an_immutable_copy_of_delayed_delivery_policy(tmp_path):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = bootstrap(base64.b64encode(public_key).decode("ascii"))
    frozen = replace(
        frozen,
        policy_snapshot={
            **dict(frozen.policy_snapshot),
            "delayed_delivery_after_ms": 500,
        },
    )
    backend = FakeBackend()
    runtime = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=backend,
        clock_ms=lambda: NOW_MS,
    )
    payload = EventBatch.model_validate(batch_payload())
    payload.records[0].client_recorded_at_ms = NOW_MS - 100

    runtime.ingest(payload, NOW_MS)

    assert runtime.timeline_journal.records[-1]["delayed_event_ids"] == []


def test_bootstrap_snapshot_is_transitively_immutable_at_construction():
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    policy = {"nested": {"thresholds": [1, 2]}}
    registry = registry_snapshot()
    archive_policy = {"nested": {"reserve": [3, 4]}}
    frozen = WorkerBootstrap(
        run_id=RUN_ID,
        contest_id=UUID("17171717-1717-1717-1717-171717171717"),
        server_ms=NOW_MS,
        scheduled_end_ms=NOW_MS + 10_000,
        active_participant_ids=(101,),
        submitted_participant_ids=(),
        policy_snapshot=policy,
        registry_snapshot=registry,
        backend_signing_public_key_b64=base64.b64encode(public_key).decode("ascii"),
        archive_policy=archive_policy,
    )

    policy["nested"]["thresholds"][0] = 99
    archive_policy["nested"]["reserve"][0] = 99

    assert frozen.policy_snapshot["nested"]["thresholds"] == (1, 2)
    assert frozen.archive_policy["nested"]["reserve"] == (3, 4)
    with pytest.raises(TypeError):
        frozen.policy_snapshot["nested"]["thresholds"][0] = 7


def test_bootstrap_parses_and_retains_ed25519_public_key():
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    frozen = bootstrap(base64.b64encode(public_key).decode("ascii"))

    assert isinstance(frozen.backend_signing_public_key, Ed25519PublicKey)
    assert frozen.backend_signing_public_key is frozen.backend_signing_public_key


@pytest.mark.parametrize(
    "encoded",
    ["not-base64", base64.b64encode(b"too-short").decode("ascii")],
)
def test_bootstrap_rejects_malformed_ed25519_public_key(encoded):
    with pytest.raises(ValueError, match="signing public key"):
        bootstrap(encoded)


@pytest.mark.parametrize(
    "participants",
    [
        ["not-an-object"],
        [{"participant_id": 101, "status": "active"}, {"participant_id": 101, "status": "active"}],
        [{"participant_id": 101, "status": "paused"}],
        [{"participant_id": 101}],
        [{"participant_id": 101, "status": 1}],
    ],
)
def test_bootstrap_participant_contract_rejects_malformed_duplicate_or_unknown_status(
    participants,
):
    payload = {
        "run_id": str(RUN_ID),
        "contest_id": "17171717-1717-1717-1717-171717171717",
        "server_ms": NOW_MS,
        "scheduled_end_ms": NOW_MS + 10_000,
        "participants": participants,
        "policy_snapshot": {
            "suspect_after_ms": 15_000,
            "disconnected_after_ms": 60_000,
        },
        "registry_snapshot": registry_snapshot(),
        "backend_signing_public_key_b64": VALID_PUBLIC_KEY_B64,
        "archive_policy": {},
        "generation": 1,
    }

    with pytest.raises((TypeError, ValueError)):
        WorkerBootstrap.from_payload(payload)


def test_bootstrap_rejects_legacy_integer_contest_identity():
    payload = _bootstrap_payload(generation=1)
    payload["contest_id"] = 17

    with pytest.raises(ValueError, match="badly formed hexadecimal UUID"):
        WorkerBootstrap.from_payload(payload)


def test_participant_first_seen_after_bootstrap_is_durably_auto_submitted(tmp_path):
    _, runtime, backend, _ = make_client(tmp_path)
    payload = batch_payload()
    payload["participant_id"] = 303
    observed = EventBatch.model_validate(payload)

    runtime.ingest(observed, NOW_MS)
    runtime.tick(NOW_MS + 10_000)

    receipt = runtime.timeline_journal.records[-2]
    assert receipt["participant_id"] == 303
    submitted = {
        command["participant_id"]
        for sent in backend.command_batches
        for command in sent
        if command["kind"] == "auto_submit"
    }
    assert submitted == {101, 303}


def test_signed_submission_observation_precedes_equal_time_batch_decision(tmp_path):
    client, runtime, backend, private_key = make_client(tmp_path)
    observation = {
        "schema_version": 1,
        "participant_id": 101,
        "source": "backend",
    }
    body = json.dumps(observation, separators=(",", ":")).encode("utf-8")

    submitted = client.post(
        f"/v1/runs/{RUN_ID}/observations/submission",
        content=body,
        headers=signed_headers(private_key, body),
    )
    event = post_batch(client, private_key, batch_payload())

    assert submitted.status_code == 200
    assert event.status_code == 200
    ordered = runtime.timeline_journal.records[-2:]
    assert [item["kind"] for item in ordered] == ["submission", "batch_receipt"]
    assert [item["server_ms"] for item in ordered] == [NOW_MS, NOW_MS]
    record_events = [
        command
        for sent in backend.command_batches
        for command in sent
        if command["kind"] == "record_event"
    ]
    assert record_events[-1]["action"] == "audit"


def _bootstrap_payload(*, generation: int, previous_manifest=None):
    return {
        "run_id": str(RUN_ID),
        "contest_id": "17171717-1717-1717-1717-171717171717",
        "server_ms": NOW_MS,
        "scheduled_end_ms": NOW_MS + 10_000,
        "participants": [{"participant_id": 101, "status": "active"}],
        "policy_snapshot": {
            "suspect_after_ms": 15_000,
            "disconnected_after_ms": 60_000,
        },
        "registry_snapshot": registry_snapshot(),
        "backend_signing_public_key_b64": VALID_PUBLIC_KEY_B64,
        "archive_policy": {},
        "generation": generation,
        **({} if previous_manifest is None else {"previous_manifest": previous_manifest}),
    }


def test_generation_after_one_requires_exact_prior_manifest_identity():
    with pytest.raises(ValueError, match="previous manifest"):
        WorkerBootstrap.from_payload(_bootstrap_payload(generation=2))

    previous = {
        "generation": 1,
        "object_key": f"runs/{RUN_ID}/generation-1/manifest.json",
        "sha256": "a" * 64,
    }
    parsed = WorkerBootstrap.from_payload(
        _bootstrap_payload(generation=2, previous_manifest=previous)
    )

    assert parsed.previous_manifest == previous


def test_valid_prior_manifest_is_passed_to_archive_and_manifest_content(tmp_path):
    previous = {
        "generation": 1,
        "object_key": f"runs/{RUN_ID}/generation-1/manifest.json",
        "sha256": "a" * 64,
    }
    parsed = WorkerBootstrap.from_payload(
        _bootstrap_payload(generation=2, previous_manifest=previous)
    )
    runtime = WorkerRuntime(
        bootstrap=parsed,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )
    runtime.ingest(EventBatch.model_validate(batch_payload()), NOW_MS)
    runtime.journal.rotate_if_due(NOW_MS, force=True)
    runtime.archiver.upload_all_sealed()
    manifest = runtime.archiver.build_manifest(final_cursors={})

    assert manifest.payload["previous_manifest"] == previous
    assert manifest.payload["previous_manifest_sha256"] == "a" * 64


@pytest.mark.parametrize(
    "previous",
    [
        {"generation": 2, "object_key": "wrong", "sha256": "a" * 64},
        {"generation": 1, "object_key": "wrong", "sha256": "a" * 64},
        {
            "generation": 1,
            "object_key": f"runs/{RUN_ID}/generation-1/manifest.json",
            "sha256": "not-a-digest",
        },
    ],
)
def test_generation_chain_conflicts_fail_bootstrap(previous):
    with pytest.raises(ValueError, match="previous manifest"):
        WorkerBootstrap.from_payload(
            _bootstrap_payload(generation=2, previous_manifest=previous)
        )


def test_capacity_warning_counts_complete_run_root_and_is_restored_on_restart(
    tmp_path, monkeypatch
):
    fake = SimpleNamespace(f_bavail=10**9, f_frsize=1)
    monkeypatch.setattr(os, "statvfs", lambda _path: fake)
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = replace(
        bootstrap(base64.b64encode(public_key).decode("ascii")),
        archive_policy={
            "capacity_warning_bytes": 128,
            "capacity_reserve_bytes": 0,
        },
    )
    run_root = tmp_path / str(RUN_ID)
    run_root.mkdir(parents=True)
    (run_root / "other-writer.bin").write_bytes(b"x" * 256)
    runtime = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )

    assert "journal_capacity_low" in runtime.warning_codes
    runtime.close()

    recovered = WorkerRuntime(
        bootstrap=runtime.bootstrap,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )
    assert "journal_capacity_low" in recovered.warning_codes


def test_capacity_warning_does_not_implicitly_become_free_space_reserve_on_restart(
    tmp_path, monkeypatch
):
    fake = SimpleNamespace(f_bavail=1, f_frsize=1)
    monkeypatch.setattr(os, "statvfs", lambda _path: fake)
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = replace(
        bootstrap(base64.b64encode(public_key).decode("ascii")),
        archive_policy={
            "capacity_warning_bytes": 10**9,
            "capacity_reserve_bytes": 0,
        },
    )
    runtime = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )

    assert "journal_capacity_low" not in runtime.warning_codes
    runtime.close()
    recovered = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )
    assert "journal_capacity_low" not in recovered.warning_codes


def test_explicit_capacity_reserve_is_applied_by_runtime_on_restart(
    tmp_path, monkeypatch
):
    fake = SimpleNamespace(f_bavail=1, f_frsize=1)
    monkeypatch.setattr(os, "statvfs", lambda _path: fake)
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = replace(
        bootstrap(base64.b64encode(public_key).decode("ascii")),
        archive_policy={
            "capacity_warning_bytes": 10**9,
            "capacity_reserve_bytes": 2,
        },
    )
    runtime = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )

    assert "journal_capacity_low" in runtime.warning_codes
    runtime.close()
    recovered = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )
    assert "journal_capacity_low" in recovered.warning_codes


def test_malformed_backend_success_is_bounded_502_without_ack(tmp_path):
    client, runtime, _, private_key = make_client(tmp_path)
    backend = FixedResponseBackend({"accepted_command_ids": []})
    runtime.backend = backend

    response = post_batch(client, private_key, batch_payload())

    assert response.status_code == 502
    assert response.json() == {"detail": "Backend command protocol failed"}
    assert "acked_through_seq" not in response.json()
    assert runtime.outbox.pending_commands
    assert runtime.healthy is False


def test_ingest_archive_fatal_failure_is_bounded_507_without_ack(
    tmp_path, monkeypatch
):
    client, runtime, _, private_key = make_client(tmp_path)

    def fail_rotation(_received_at_ms):
        raise ArchiveFatalFailure("local archive path and secret details")

    monkeypatch.setattr(runtime.archiver, "rotate_due", fail_rotation)
    bounded_client = TestClient(client.app, raise_server_exceptions=False)

    response = post_batch(bounded_client, private_key, batch_payload())

    assert response.status_code == 507
    assert response.json() == {"detail": "durable journal unavailable"}
    assert "acked_through_seq" not in response.json()
    assert "local archive path" not in response.text
    assert runtime.healthy is False


def test_stop_local_archive_failure_is_bounded_507_and_unhealthy(
    tmp_path, monkeypatch
):
    client, runtime, _, private_key = make_client(tmp_path)

    def fail_rotation(*_args, **_kwargs):
        raise OSError("local path and secret details")

    monkeypatch.setattr(runtime.journal, "rotate_if_due", fail_rotation)
    response = client.post(
        f"/v1/runs/{RUN_ID}/control/stop",
        content=b"",
        headers=signed_headers(private_key, b""),
    )

    assert response.status_code == 507
    assert response.json() == {
        "detail": {"archived": False, "state": "STOPPING", "error": "archive durability failed"}
    }
    assert runtime.healthy is False
    assert "local path" not in response.text


def test_first_run_directory_fsync_failure_unwinds_journal_owner(tmp_path, monkeypatch):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = bootstrap(base64.b64encode(public_key).decode("ascii"))
    real_fsync = os.fsync
    saw_directory = False
    created = None

    def fail_directory_fsync(fd):
        nonlocal saw_directory
        if stat.S_ISDIR(os.fstat(fd).st_mode):
            saw_directory = True
            raise OSError("directory fsync failed")
        return real_fsync(fd)

    monkeypatch.setattr(os, "fsync", fail_directory_fsync)
    try:
        with pytest.raises(OSError, match="directory fsync"):
            created = WorkerRuntime(
                bootstrap=frozen,
                data_root=tmp_path,
                backend=FakeBackend(),
                clock_ms=lambda: NOW_MS,
            )
    finally:
        if created is not None:
            created.close()
    assert saw_directory is True

    monkeypatch.setattr(os, "fsync", real_fsync)
    recovered = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )
    recovered.close()


@pytest.mark.parametrize("boundary", ["timeline", "outbox", "replay", "archive"])
def test_runtime_constructor_failure_unwinds_every_acquired_resource(
    tmp_path, monkeypatch, boundary
):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = bootstrap(base64.b64encode(public_key).decode("ascii"))
    target = {
        "timeline": "integrity_service.worker.runtime.TimelineJournal",
        "outbox": "integrity_service.worker.runtime.CommandOutbox",
        "archive": "integrity_service.worker.runtime.ArchiveManager",
    }.get(boundary)

    with monkeypatch.context() as patch:
        if target is not None:
            def fail_constructor(*_args, **_kwargs):
                raise RuntimeError(f"{boundary} acquisition failed")

            patch.setattr(target, fail_constructor)
        else:
            def fail_replay(_self):
                raise RuntimeError("replay acquisition failed")

            patch.setattr(WorkerRuntime, "_replay_timeline", fail_replay)
        with pytest.raises(RuntimeError, match="acquisition failed"):
            WorkerRuntime(
                bootstrap=frozen,
                data_root=tmp_path,
                backend=FakeBackend(),
                clock_ms=lambda: NOW_MS,
            )

    recovered = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
        clock_ms=lambda: NOW_MS,
    )
    recovered.close()


def test_runtime_close_attempts_every_resource_after_one_cleanup_failure(tmp_path, monkeypatch):
    _, runtime, _, _ = make_client(tmp_path)
    closed: list[str] = []

    def close(name, *, fail=False):
        def owned_close():
            closed.append(name)
            if fail:
                raise OSError("cleanup failed")
        return owned_close

    monkeypatch.setattr(runtime.journal, "close", close("journal"))
    monkeypatch.setattr(runtime.timeline_journal, "close", close("timeline", fail=True))
    monkeypatch.setattr(runtime.outbox, "close", close("outbox"))
    monkeypatch.setattr(runtime.archiver, "close", close("archive"))

    with pytest.raises(OSError, match="cleanup failed"):
        runtime.close()

    assert set(closed) == {"journal", "timeline", "outbox", "archive"}


def _owned_app_environment(monkeypatch, tmp_path):
    token_path = tmp_path / "token"
    token_path.write_text("scoped-token", encoding="utf-8")
    monkeypatch.setenv("QJUDGE_INTEGRITY_RUN_ID", str(RUN_ID))
    monkeypatch.setenv("QJUDGE_BACKEND_URL", "https://backend.example")
    monkeypatch.setenv("QJUDGE_RUN_TOKEN_PATH", str(token_path))
    monkeypatch.setenv("QJUDGE_RUN_DATA", str(tmp_path / "run-data"))


def test_owned_lifespan_rejects_malformed_key_before_runtime_start(
    tmp_path, monkeypatch
):
    import integrity_service.worker.app as app_module

    _owned_app_environment(monkeypatch, tmp_path)
    runtime_constructed = False
    backend_closed = False

    class Backend:
        def __init__(self, **_kwargs):
            pass

        def fetch_bootstrap(self):
            payload = _bootstrap_payload(generation=1)
            payload["backend_signing_public_key_b64"] = "malformed"
            return payload

        def close(self):
            nonlocal backend_closed
            backend_closed = True

    class Runtime:
        def __init__(self, **_kwargs):
            nonlocal runtime_constructed
            runtime_constructed = True

    monkeypatch.setattr(app_module, "BackendClient", Backend)
    monkeypatch.setattr(app_module, "WorkerRuntime", Runtime)

    with pytest.raises(ValueError, match="signing public key"):
        with TestClient(app_module.create_app()):
            pass

    assert runtime_constructed is False
    assert backend_closed is True


@pytest.mark.parametrize("failure", ["fetch", "parse", "runtime", "scheduler_start"])
def test_owned_lifespan_startup_failure_closes_every_acquired_owner(
    tmp_path, monkeypatch, failure
):
    import integrity_service.worker.app as app_module

    _owned_app_environment(monkeypatch, tmp_path)
    closed: list[str] = []

    class Backend:
        def __init__(self, **_kwargs):
            pass

        def fetch_bootstrap(self):
            if failure == "fetch":
                raise BackendUnavailable("bootstrap unavailable")
            if failure == "parse":
                return {"run_id": str(RUN_ID)}
            return _bootstrap_payload(generation=1)

        def close(self):
            closed.append("backend")

    class Runtime:
        def __init__(self, **_kwargs):
            if failure == "runtime":
                raise RuntimeError("runtime failed")

        async def start_scheduler(self):
            if failure == "scheduler_start":
                raise RuntimeError("scheduler start failed")

        async def stop_scheduler(self):
            closed.append("scheduler")

        def close(self):
            closed.append("runtime")

    monkeypatch.setattr(app_module, "BackendClient", Backend)
    monkeypatch.setattr(app_module, "WorkerRuntime", Runtime)
    application = app_module.create_app()

    with pytest.raises(Exception):
        with TestClient(application):
            pass

    assert "backend" in closed
    if failure == "scheduler_start":
        assert "runtime" in closed


def test_lifespan_scheduler_shutdown_failure_still_closes_runtime_and_backend(
    tmp_path, monkeypatch
):
    import integrity_service.worker.app as app_module

    _owned_app_environment(monkeypatch, tmp_path)
    closed: list[str] = []

    class Backend:
        def __init__(self, **_kwargs):
            pass

        def fetch_bootstrap(self):
            return _bootstrap_payload(generation=1)

        def close(self):
            closed.append("backend")

    class Runtime:
        def __init__(self, **_kwargs):
            pass

        async def start_scheduler(self):
            pass

        async def stop_scheduler(self):
            raise RuntimeError("scheduler shutdown failed")

        def close(self):
            closed.append("runtime")

    monkeypatch.setattr(app_module, "BackendClient", Backend)
    monkeypatch.setattr(app_module, "WorkerRuntime", Runtime)
    application = app_module.create_app()

    with pytest.raises(RuntimeError, match="shutdown"):
        with TestClient(application):
            pass

    assert closed == ["runtime", "backend"]


def test_backend_client_second_client_failure_closes_first_owner(monkeypatch):
    import integrity_service.worker.backend_client as backend_module

    opened = []

    class Client:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    def client_factory(*_args, **_kwargs):
        if opened:
            raise RuntimeError("upload client failed")
        client = Client()
        opened.append(client)
        return client

    monkeypatch.setattr(backend_module.httpx, "Client", client_factory)

    with pytest.raises(RuntimeError, match="upload client"):
        BackendClient(
            base_url="https://backend.example",
            run_id=RUN_ID,
            token="scoped-token",
        )

    assert opened[0].closed is True


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


@pytest.mark.parametrize(
    "transport_error",
    [
        httpx.ReadTimeout("read timeout"),
        httpx.WriteTimeout("write timeout"),
        httpx.PoolTimeout("pool timeout"),
        httpx.ReadError("read failed"),
    ],
)
def test_backend_transport_failures_are_normalized_without_internal_details(
    transport_error,
):
    def handler(_request: httpx.Request) -> httpx.Response:
        raise transport_error

    client = BackendClient(
        base_url="https://backend.example",
        run_id=RUN_ID,
        token="scoped-token",
        retry_attempts=1,
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(BackendUnavailable, match="unavailable") as captured:
        client.fetch_bootstrap()

    assert "timeout" not in str(captured.value)


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
