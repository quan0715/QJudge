from __future__ import annotations

import base64
import json
import os
from dataclasses import replace
from pathlib import Path
import stat
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
import pytest

from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.worker.backend_client import (
    BackendClient,
    BackendProtocolError,
    BackendUnavailable,
)
from integrity_service.worker.runtime import WorkerRuntime
from integrity_service.worker.bootstrap import WorkerBootstrap
from integrity_service.journal.command_outbox import (
    CommandDeliveryProtocolError,
    DurableLogCorruption,
)

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

    def send_commands(
        self, commands: tuple[dict[str, object], ...]
    ) -> dict[str, object]:
        self.command_batches.append(commands)
        if self.failures_remaining:
            self.failures_remaining -= 1
            raise BackendUnavailable("temporarily unavailable")
        return {
            "accepted_command_ids": [item["command_id"] for item in commands],
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
        active_participant_ids=(101,),
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
    participant_id: int = 101,
    event_type: str = "exit_fullscreen_triggered",
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    return EventBatch(
        schema_version=1,
        batch_id=batch_id or uuid4(),
        run_id=RUN_ID,
        participant_id=participant_id,
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


def test_worker_processes_events_without_submission_state(tmp_path):
    """Submitted participants are a Backend concern, never an event-policy input."""
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
    )

    ack = runtime.accept_batch(
        EventBatch.model_validate(batch_payload(participant_id=202)), NOW_MS
    )
    runtime.process_pending(10)
    runtime.outbox.deliver_pending(runtime.backend)

    assert ack.acked_through_seq == 1
    command = backend.command_batches[-1][0]
    assert command["participant_id"] == 202
    assert command["action"] == "record"
    assert command["incident_id"] is not None


def test_worker_uses_batch_interval_as_incident_delivery_tolerance(tmp_path):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    base = bootstrap(base64.b64encode(public_key).decode("ascii"))
    runtime = WorkerRuntime(
        bootstrap=replace(
            base,
            policy_snapshot={
                **dict(base.policy_snapshot),
                "batch_interval_ms": 5_000,
            },
        ),
        data_root=tmp_path,
        backend=FakeBackend(),
    )

    runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
    runtime.process_pending(10)
    runtime.outbox.deliver_pending(runtime.backend)

    assert runtime.incidents.next_deadline_server_ms() == NOW_MS + 35_000


def test_worker_restart_accepts_changed_backend_active_participants(tmp_path):
    """Rejoin status changes must not make the durable run baseline unrecoverable."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    frozen = bootstrap(base64.b64encode(public_key).decode("ascii"))
    runtime = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
    )
    runtime.close()

    recovered = WorkerRuntime(
        bootstrap=replace(
            frozen,
            server_ms=NOW_MS + 1_000,
            active_participant_ids=(101, 202),
        ),
        data_root=tmp_path,
        backend=FakeBackend(),
    )

    ack = recovered.accept_batch(
        EventBatch.model_validate(batch_payload(participant_id=202)),
        NOW_MS + 1_000,
    )

    assert ack.acked_through_seq == 1


def make_runtime(tmp_path: Path):
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
    )
    return runtime, backend


def test_batch_ack_precedes_decisions_and_backend_delivery(tmp_path):
    runtime, backend = make_runtime(tmp_path)
    ack = runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
    assert ack.acked_through_seq == 1
    assert len(runtime.journal.recovered_batches) == 1
    assert len(runtime.timeline_journal.records) == 1
    assert runtime.outbox.pending_commands == ()
    assert backend.command_batches == []
    assert runtime.process_pending(1) == 1
    receipt = runtime.timeline_journal.records[-1]
    assert receipt["kind"] == "batch_receipt"
    assert receipt["server_ms"] == NOW_MS
    assert receipt["timeline_seq"] == 1
    assert len(receipt["records"]) == 1
    assert runtime.outbox.pending_commands
    runtime.outbox.deliver_pending(backend)
    assert runtime.outbox.pending_commands == ()
    assert backend.command_batches


def test_journal_failure_returns_507_without_ack_and_marks_unhealthy(
    tmp_path, monkeypatch
):
    runtime, _ = make_runtime(tmp_path)

    def fail(_batch):
        raise OSError("disk full")

    monkeypatch.setattr(runtime.journal, "append_batch_once", fail)
    with pytest.raises(OSError, match="disk full"):
        runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)

    assert runtime.healthy is False


def test_backend_retry_preserves_commands_without_duplicate_receipt_decisions(tmp_path):
    runtime, backend = make_runtime(tmp_path)
    batch = EventBatch.model_validate(batch_payload())
    assert runtime.accept_batch(batch, NOW_MS).acked_through_seq == 1
    assert runtime.process_pending(1) == 1
    backend.failures_remaining = 1
    with pytest.raises(BackendUnavailable):
        runtime.outbox.deliver_pending(backend)
    assert runtime.accept_batch(batch, NOW_MS + 1).acked_through_seq == 1
    assert runtime.process_pending(1) == 0
    runtime.outbox.deliver_pending(backend)
    assert backend.command_batches[0] == backend.command_batches[1]
    assert len(runtime.timeline_journal.records) == 2


def test_new_batch_is_durable_while_old_command_delivery_is_unavailable(tmp_path):
    runtime, backend = make_runtime(tmp_path)
    first = EventBatch.model_validate(batch_payload())
    runtime.accept_batch(first, NOW_MS)
    runtime.process_pending(1)
    backend.failures_remaining = 1
    with pytest.raises(BackendUnavailable):
        runtime.outbox.deliver_pending(backend)
    second = EventBatch.model_validate(batch_payload())
    second.first_seq = second.last_seq = second.records[0].seq = 2
    assert runtime.accept_batch(second, NOW_MS + 1).acked_through_seq == 2
    assert runtime.journal.recovered_batches == (first, second)
    assert runtime.healthy


def test_unknown_signal_is_raw_journaled_ackable_and_deterministically_warned(tmp_path):
    runtime, backend = make_runtime(tmp_path)
    payload = batch_payload(event_type="future_detector_signal", payload={"x": 1})

    runtime.accept_batch(EventBatch.model_validate(payload), NOW_MS)

    assert (
        runtime.journal.recovered_batches[0].records[0].event_type
        == "future_detector_signal"
    )
    runtime.process_pending(10)
    runtime.outbox.deliver_pending(runtime.backend)
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
    runtime, backend = make_runtime(tmp_path)
    payload = batch_payload(payload={"unexpected": True})

    runtime.accept_batch(EventBatch.model_validate(payload), NOW_MS)
    runtime.process_pending(10)
    runtime.outbox.deliver_pending(runtime.backend)

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
    )
    payload = EventBatch.model_validate(batch_payload())
    payload.records[0].client_recorded_at_ms = NOW_MS - 1_000

    runtime.accept_batch(payload, NOW_MS)
    runtime.process_pending(10)
    runtime.outbox.deliver_pending(runtime.backend)

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




def test_timeline_failure_keeps_receipt_durable_and_requires_recovery(tmp_path, monkeypatch):
    runtime, _ = make_runtime(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    assert runtime.accept_batch(payload, NOW_MS).acked_through_seq == 1
    def fail(*args):
        raise OSError("timeline fsync failed")
    monkeypatch.setattr(runtime.timeline_journal._log, "append", fail)
    with pytest.raises(OSError, match="timeline fsync"):
        runtime.process_pending(1)
    assert runtime.healthy is False
    with pytest.raises(OSError, match="recovery"):
        runtime.accept_batch(payload, NOW_MS + 1)
    runtime.close()
    recovered = WorkerRuntime(bootstrap=runtime.bootstrap, data_root=tmp_path, backend=FakeBackend())
    assert recovered.process_pending(1) == 1
    assert recovered.outbox.pending_commands
    recovered.close()


def test_backwards_receipt_time_is_rejected_before_durable_admission(tmp_path):
    runtime, _ = make_runtime(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    with pytest.raises(ValueError, match="precede"):
        runtime.accept_batch(payload, NOW_MS - 1)
    assert runtime.journal.recovered_batches == ()
    assert runtime.healthy
    assert runtime.accept_batch(payload, NOW_MS).acked_through_seq == 1
    runtime.close()


def test_restart_processes_receipt_after_failed_decision_without_browser_retry(tmp_path, monkeypatch):
    runtime, _ = make_runtime(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    runtime.accept_batch(payload, NOW_MS)
    def fail(*args):
        raise RuntimeError("receipt projection failed")
    monkeypatch.setattr(runtime.timeline_journal, "append_receipt", fail)
    with pytest.raises(RuntimeError, match="projection"):
        runtime.process_pending(1)
    assert not runtime.healthy
    runtime.close()
    recovered = WorkerRuntime(bootstrap=runtime.bootstrap, data_root=tmp_path, backend=FakeBackend())
    assert recovered.process_pending(1) == 1
    receipt = recovered.timeline_journal.records[-1]
    assert receipt["batch_id"] == str(payload.batch_id)
    assert receipt["records"]
    assert any(c["kind"] == "record_event" for c in recovered.outbox.pending_commands)
    recovered.close()


def test_fresh_process_rejects_raw_batch_missing_resident_receipt(tmp_path):
    runtime, _ = make_runtime(tmp_path)
    runtime.journal.append_batch_once(EventBatch.model_validate(batch_payload()))
    runtime.close()
    with pytest.raises(DurableLogCorruption):
        WorkerRuntime(bootstrap=runtime.bootstrap, data_root=tmp_path, backend=FakeBackend())


def test_decision_poison_disables_intake_and_processing(tmp_path, monkeypatch):
    runtime, backend = make_runtime(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    runtime.accept_batch(payload, NOW_MS)
    def fail(*args):
        raise OSError("outbox fsync failed")
    monkeypatch.setattr(runtime.outbox, "append", fail)
    with pytest.raises(OSError, match="outbox fsync"):
        runtime.process_pending(1)
    records = runtime.timeline_journal.records
    assert not runtime.healthy
    assert not runtime.accepting
    assert runtime.state == "FAILED"
    with pytest.raises(OSError, match="recovery"):
        runtime.process_pending(1)
    with pytest.raises(OSError, match="recovery"):
        runtime.accept_batch(payload, NOW_MS + 1)
    assert runtime.timeline_journal.records == records
    assert not backend.objects


def test_recovery_replays_exact_receipt_and_resends_pending_commands(tmp_path):
    runtime, backend = make_runtime(tmp_path)
    payload = EventBatch.model_validate(batch_payload())
    runtime.accept_batch(payload, NOW_MS)
    runtime.process_pending(1)
    backend.failures_remaining = 1
    with pytest.raises(BackendUnavailable):
        runtime.outbox.deliver_pending(backend)
    first_pending = runtime.outbox.pending_commands
    runtime.close()
    recovered_backend = FakeBackend()
    recovered = WorkerRuntime(bootstrap=runtime.bootstrap, data_root=tmp_path, backend=recovered_backend)
    assert recovered.outbox.pending_commands == first_pending
    assert recovered.accept_batch(payload, NOW_MS + 1).acked_through_seq == 1
    assert recovered.process_pending(1) == 0
    recovered.outbox.deliver_pending(recovered_backend)
    assert recovered_backend.command_batches[0] == first_pending
    assert len(recovered.timeline_journal.records) == 2
    recovered.close()


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
    )
    payload = EventBatch.model_validate(batch_payload())
    payload.records[0].client_recorded_at_ms = NOW_MS - 100

    runtime.accept_batch(payload, NOW_MS)
    runtime.process_pending(10)
    runtime.outbox.deliver_pending(runtime.backend)

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
        [
            {"participant_id": 101, "status": "active"},
            {"participant_id": 101, "status": "active"},
        ],
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


def test_bootstrap_requires_uuid_contest_identity():
    payload = _bootstrap_payload(generation=1)
    payload["contest_id"] = 17

    with pytest.raises(ValueError, match="badly formed hexadecimal UUID"):
        WorkerBootstrap.from_payload(payload)



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
        **(
            {}
            if previous_manifest is None
            else {"previous_manifest": previous_manifest}
        ),
    }


def test_bootstrap_freezes_backend_archive_capacity_thresholds():
    payload = _bootstrap_payload(generation=1)
    payload["archive_policy"] = {
        "capacity_warning_bytes": 1_073_741_824,
        "capacity_reserve_bytes": 268_435_456,
    }

    parsed = WorkerBootstrap.from_payload(payload)

    assert parsed.archive_policy["capacity_warning_bytes"] == 1_073_741_824
    assert parsed.archive_policy["capacity_reserve_bytes"] == 268_435_456


@pytest.mark.parametrize(
    "field",
    ("capacity_warning_bytes", "capacity_reserve_bytes"),
)
def test_bootstrap_rejects_negative_archive_capacity_thresholds(field):
    payload = _bootstrap_payload(generation=1)
    payload["archive_policy"] = {
        "capacity_warning_bytes": 1_073_741_824,
        "capacity_reserve_bytes": 268_435_456,
    }
    payload["archive_policy"][field] = -1

    with pytest.raises(ValueError, match=field):
        WorkerBootstrap.from_payload(payload)


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
    )

    assert "journal_capacity_low" in runtime.warning_codes
    runtime.close()

    recovered = WorkerRuntime(
        bootstrap=runtime.bootstrap,
        data_root=tmp_path,
        backend=FakeBackend(),
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
    )

    assert "journal_capacity_low" not in runtime.warning_codes
    runtime.close()
    recovered = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
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
    )

    assert "journal_capacity_low" in runtime.warning_codes
    runtime.close()
    recovered = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
    )
    assert "journal_capacity_low" in recovered.warning_codes


def test_malformed_delivery_keeps_commands_pending_and_intake_healthy(tmp_path):
    runtime, _ = make_runtime(tmp_path)
    backend = FixedResponseBackend({"accepted_command_ids": []})
    assert runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS).acked_through_seq == 1
    runtime.process_pending(1)
    with pytest.raises(CommandDeliveryProtocolError):
        runtime.outbox.deliver_pending(backend)
    assert runtime.outbox.pending_commands
    assert runtime.healthy


def test_intake_rotation_failure_requires_recovery(tmp_path, monkeypatch):
    runtime, _ = make_runtime(tmp_path)
    def fail(*args):
        raise OSError("rotation failed")
    monkeypatch.setattr(runtime.journal, "rotate_if_due", fail)
    with pytest.raises(OSError, match="rotation"):
        runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
    assert not runtime.healthy


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
    )
    recovered.close()


@pytest.mark.parametrize("boundary", ["timeline", "outbox", "replay", "receipts"])
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
        "receipts": "integrity_service.worker.runtime.ReceiptStore",
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
            )

    recovered = WorkerRuntime(
        bootstrap=frozen,
        data_root=tmp_path,
        backend=FakeBackend(),
    )
    recovered.close()


def test_runtime_close_attempts_every_resource_after_one_cleanup_failure(
    tmp_path, monkeypatch
):
    runtime, _ = make_runtime(tmp_path)
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
    monkeypatch.setattr(runtime.receipts, "close", close("receipts"))

    with pytest.raises(OSError, match="cleanup failed"):
        runtime.close()

    assert set(closed) == {"journal", "timeline", "outbox", "receipts"}


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



@pytest.mark.parametrize("operation", ["descriptors", "commands", "finalize"])
def test_backend_client_internal_http_callbacks_avoid_django_ssl_redirect(operation):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "backend"
        assert request.url.scheme == "http"
        assert request.headers["Authorization"] == "Resident rotated-token"
        # Model Django's SECURE_SSL_REDIRECT with its configured proxy header.
        if request.headers.get("X-Forwarded-Proto") != "https":
            return httpx.Response(301, headers={"Location": str(request.url.copy_with(scheme="https"))})
        return httpx.Response(200, json={"descriptors": [], "accepted_command_ids": ["id"], "authorized": True})

    client = BackendClient(
        base_url="http://backend:8000", run_id=RUN_ID, token="initial-token",
        credential_provider=lambda: "rotated-token", transport=httpx.MockTransport(handler),
    )
    try:
        if operation == "descriptors":
            assert client.fetch_resident_descriptors(None) == []
        elif operation == "commands":
            assert client.send_commands(({"command_id": "id", "kind": "update_run_checkpoint"},))["accepted_command_ids"] == ["id"]
        else:
            assert client.finalize_control({"phase": "authorize", "expected_revision": 1})["authorized"] is True
    finally:
        client.close()


def test_backend_client_presigned_upload_does_not_forward_private_callback_headers():
    requests = []

    def storage(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200)

    client = BackendClient(
        base_url="http://backend:8000", run_id=RUN_ID, token="private-token",
        upload_transport=httpx.MockTransport(storage),
    )
    try:
        client.upload_presigned("https://storage.example/archive?signature=storage-only", b"archive", "00" * 32, "application/gzip")
    finally:
        client.close()
    assert len(requests) == 1
    assert requests[0].content == b"archive"
    assert requests[0].headers["Content-Type"] == "application/gzip"
    assert "Authorization" not in requests[0].headers
    assert "X-Forwarded-Proto" not in requests[0].headers


def test_backend_client_retries_only_retryable_status_with_identical_command_bytes():
    bodies: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.content)
        assert request.headers["Authorization"] == "Resident scoped-token"
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
        client.send_commands(({"command_id": str(uuid4()), "kind": "update_run_checkpoint"},))

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
