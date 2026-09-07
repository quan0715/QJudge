from dataclasses import replace
from uuid import uuid4

import pytest

from integrity_service.core.schemas import EventBatch
from integrity_service.resident.registry import RunRegistry
from test_resident_registry import descriptor
from test_worker_api import FakeBackend, NOW_MS, batch_payload


def next_batch(seq=2, **kwargs):
    batch = batch_payload(**kwargs)
    batch["records"][0]["seq"] = seq
    batch["first_seq"] = batch["last_seq"] = seq
    return EventBatch.model_validate(batch)


def test_gap_suppresses_connectivity_effects_and_replays_dispositions(tmp_path):
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        runtime.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
        runtime.process_pending(1)
        runtime.record_service_gap(NOW_MS, NOW_MS + 200000, "platform_unavailable")
        runtime.accept_batch(next_batch(), NOW_MS + 200000)
        runtime.process_pending(1)
        pending = runtime.outbox.pending_commands
        assert not any(c.get("event_type") in {"connectivity_suspect", "connectivity_timeout"}
            and c.get("action") in {"record", "pause", "lock", "submit"} for c in pending)
        assert runtime.outbox.suppressed_commands
        suppressed = runtime.outbox.suppressed_commands
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        assert runtime.outbox.pending_commands == pending
        assert runtime.outbox.suppressed_commands == suppressed


def test_restart_records_recovery_before_new_decision_but_keeps_committed_history(tmp_path):
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.process_pending(1)
        original = runtime.outbox.pending_commands
    latest = replace(first, bootstrap=replace(first.bootstrap, server_ms=NOW_MS + 200000))
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(latest)
        runtime.accept_batch(next_batch(), NOW_MS + 200000)
        runtime.process_pending(1)
        assert runtime.outbox.suppressed_commands, "recovery did not protect the interrupted interval"
        assert runtime.outbox.pending_commands[:len(original)] == original
        assert any(record.get("reason") == "process_recovery" for record in runtime.timeline_journal.records)


def test_gap_durability_failure_fences_decisions_and_ack(tmp_path, monkeypatch):
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.accept_batch(next_batch(1), NOW_MS)
        def fail(**_):
            raise OSError("disk full")
        monkeypatch.setattr(runtime.timeline_journal, "append_service_gap", fail)
        with pytest.raises(OSError):
            runtime.record_service_gap(NOW_MS, NOW_MS + 10, "storage_unavailable")
        with pytest.raises(OSError):
            runtime.process_pending(1)
        with pytest.raises(OSError):
            runtime.accept_batch(next_batch(), NOW_MS + 10)
        assert runtime.receipts.processed_cursor == 0


def test_gap_keeps_genuine_incident_escalation_and_later_healthy_silence(tmp_path):
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.process_pending(1)
        runtime.record_service_gap(NOW_MS + 1, NOW_MS + 200000, "platform_unavailable")
        runtime.accept_batch(next_batch(), NOW_MS + 200000)
        runtime.process_pending(1)
        assert any(c.get("event_type") == "exit_fullscreen"
            and c.get("action") == "pause" for c in runtime.outbox.pending_commands)
        runtime.accept_batch(next_batch(3), NOW_MS + 300000)
        runtime.process_pending(1)
        assert any(c.get("event_type") == "connectivity_timeout"
            and c.get("action") == "pause" for c in runtime.outbox.pending_commands)


def test_lag_without_proven_gap_does_not_invent_platform_incident(tmp_path):
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.accept_batch(next_batch(), NOW_MS + 200000)
        runtime.process_pending(2)
        assert not runtime.outbox.suppressed_commands
        assert any(c.get("event_type") == "connectivity_timeout" for c in runtime.outbox.pending_commands)


def test_recovery_does_not_mask_precrash_pending_receipt_history(tmp_path):
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.process_pending(1)
        runtime.accept_batch(next_batch(), NOW_MS + 100000)
    latest = replace(first, bootstrap=replace(first.bootstrap, server_ms=NOW_MS + 200000))
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(latest)
        runtime.process_pending(1)
        assert any(c.get("event_type") == "connectivity_timeout" for c in runtime.outbox.pending_commands)
        assert not runtime.outbox.suppressed_commands


def test_registry_gap_is_scoped_and_unknown_run_never_creates_runtime(tmp_path):
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        first = descriptor()
        runtime = registry.ensure(first)
        assert hasattr(registry, "record_service_gap"), "Run-scoped gap interface missing"
        with pytest.raises(KeyError):
            registry.record_service_gap(uuid4(), NOW_MS, NOW_MS + 1, "platform_unavailable")
        registry.record_service_gap(runtime.run_id, NOW_MS, NOW_MS + 1, "platform_unavailable")
        assert registry.run_ids() == (runtime.run_id,)
        assert runtime.timeline_journal.records[-1]["reason"] == "platform_unavailable"


def test_refresh_never_creates_recovery_gap_and_committed_timeout_is_not_rewritten(tmp_path):
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.accept_batch(next_batch(), NOW_MS + 100000)
        runtime.process_pending(2)
        committed = runtime.outbox.pending_commands
        assert any(c.get("event_type") == "connectivity_timeout" for c in committed)
        registry.ensure(replace(first, bootstrap=replace(first.bootstrap, server_ms=NOW_MS + 200000)))
        assert not any(r.get("kind") == "service_gap" for r in runtime.timeline_journal.records)
        runtime.record_service_gap(NOW_MS, NOW_MS + 200000, "platform_unavailable")
        assert runtime.outbox.pending_commands == committed
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        assert registry.ensure(first).outbox.pending_commands == committed


@pytest.mark.parametrize("fail_at", ["after_gap_fsync", "suppression_write", "processed_cursor"])
def test_crash_replays_gap_intent_and_repairs_disposition_without_redelivery(tmp_path, monkeypatch, fail_at):
    first = descriptor()
    registry = RunRegistry(tmp_path, lambda _: FakeBackend())
    runtime = registry.ensure(first)
    runtime.accept_batch(next_batch(1), NOW_MS)
    runtime.process_pending(1)
    runtime.outbox.deliver_pending(runtime.backend)
    previously_delivered = {c["command_id"] for batch in runtime.backend.command_batches for c in batch}
    def fail(*_, **__):
        raise OSError("simulated crash boundary")
    try:
        if fail_at == "after_gap_fsync":
            monkeypatch.setattr(runtime.timeline, "record_service_gap", fail)
            with pytest.raises(OSError):
                runtime.record_service_gap(NOW_MS, NOW_MS + 200000, "platform_unavailable")
        else:
            runtime.record_service_gap(NOW_MS, NOW_MS + 200000, "platform_unavailable")
            runtime.accept_batch(next_batch(), NOW_MS + 200000)
            if fail_at == "suppression_write":
                monkeypatch.setattr(runtime.outbox, "record_suppressed_command", fail)
            else:
                monkeypatch.setattr(runtime.receipts, "mark_processed", fail)
            with pytest.raises(OSError):
                runtime.process_pending(1)
    finally:
        registry.close()
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        if fail_at == "after_gap_fsync":
            runtime.accept_batch(next_batch(), NOW_MS + 200000)
            runtime.process_pending(1)
        assert runtime.receipts.processed_cursor == 2
        assert len(runtime.outbox.suppressed_commands) == 2
        runtime.outbox.deliver_pending(runtime.backend)
        delivered = [c for batch in runtime.backend.command_batches for c in batch]
        assert not any(c.get("event_type") in {"connectivity_suspect", "connectivity_timeout"} for c in delivered)
        assert not previously_delivered.intersection(c["command_id"] for c in delivered)
        assert len(runtime.journal.recovered_batches) == 2


def test_recovery_handles_multiple_students_without_class_wide_connectivity_penalties(tmp_path):
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        for participant in range(101, 106):
            runtime.accept_batch(next_batch(1, participant_id=participant), NOW_MS)
        runtime.process_pending(5)
    latest = replace(first, bootstrap=replace(first.bootstrap, server_ms=NOW_MS + 200000))
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(latest)
        runtime.accept_batch(next_batch(), NOW_MS + 200000)
        runtime.process_pending(1)
        assert len(runtime.outbox.suppressed_commands) == 10
        assert not any(c.get("event_type") in {"connectivity_suspect", "connectivity_timeout"}
            and c.get("action") != "audit" for c in runtime.outbox.pending_commands)


def test_actual_storage_failure_requires_recovery_and_does_not_block_other_run(tmp_path, monkeypatch):
    first = descriptor()
    second = replace(first, bootstrap=replace(first.bootstrap, run_id=uuid4()))
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.process_pending(1)
        other = registry.ensure(second)
        def fail(_):
            raise OSError("storage unavailable")
        monkeypatch.setattr(runtime.journal, "append_batch_once", fail)
        with pytest.raises(OSError):
            runtime.accept_batch(next_batch(), NOW_MS + 1)
        with pytest.raises(OSError):
            runtime.process_pending(1)
        batch = next_batch(1).model_copy(update={"run_id": other.run_id})
        assert other.accept_batch(batch, NOW_MS).acked_through_seq == 1
    latest = replace(first, bootstrap=replace(first.bootstrap, server_ms=NOW_MS + 200000))
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(latest)
        runtime.process_pending(1)
        runtime.accept_batch(next_batch(3), NOW_MS + 200000)
        runtime.process_pending(1)
        assert len(runtime.journal.recovered_batches) == 3
        assert len(runtime.outbox.suppressed_commands) == 2


def test_suppression_sink_rejects_non_connectivity_command(tmp_path):
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.process_pending(1)
        command = runtime.outbox.pending_commands[0]
        command["command_id"] = str(uuid4())
        with pytest.raises(ValueError):
            runtime.outbox.record_suppressed_command(command, reason="platform_gap")


def test_health_gap_counts_only_observed_affected_participants_and_survives_replay(tmp_path):
    first = descriptor()
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(first)
        runtime.accept_batch(next_batch(1), NOW_MS)
        runtime.process_pending(1)
        runtime.record_service_gap(NOW_MS, NOW_MS + 200000, "platform_unavailable")
        runtime.accept_batch(next_batch(), NOW_MS + 200000)
        runtime.process_pending(1)
        health = runtime.health_snapshot()
        assert hasattr(health, "service_gap_count"), "bounded gap read model is missing"
        assert health.service_gap_count == 1
        assert health.last_service_gap_ended_ms == NOW_MS + 200000
        assert health.suppressed_connectivity_commands == 2
        assert health.gap_affected_participant_count == 1
        assert health.healthy
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        assert registry.ensure(first).health_snapshot() == health


def test_gap_metadata_capacity_failure_preserves_existing_durable_history(tmp_path, monkeypatch):
    from integrity_service.core import timeline
    monkeypatch.setattr(timeline, "MAX_SERVICE_GAPS", 2, raising=False)
    with RunRegistry(tmp_path, lambda _: FakeBackend()) as registry:
        runtime = registry.ensure(descriptor())
        runtime.record_service_gap(NOW_MS, NOW_MS + 1, "platform_unavailable")
        runtime.record_service_gap(NOW_MS + 2, NOW_MS + 3, "platform_unavailable")
        durable = runtime.timeline_journal.records
        with pytest.raises(OSError):
            runtime.record_service_gap(NOW_MS + 4, NOW_MS + 5, "platform_unavailable")
        assert runtime.timeline_journal.records == durable
        assert not runtime.accepting


@pytest.mark.parametrize("action,expected", [("record", True), ("pause", True), ("lock", True), ("submit", True), ("audit", False)])
def test_connectivity_gap_filter_uses_actual_command_action(action, expected):
    from integrity_service.core.connectivity import connectivity_effect_overlaps_gap
    from test_connectivity import monitor
    subject = monitor()
    subject.observe(participant_id=101, device_id="d", server_ms=1000)
    command = replace(subject.tick(61000)[-1], action=action)
    assert connectivity_effect_overlaps_gap(command, 2000, 60000) is expected
    assert not connectivity_effect_overlaps_gap(command, 61000, 62000)
    assert not connectivity_effect_overlaps_gap(command, 0, 1000)


def test_deadline_command_is_never_a_connectivity_effect():
    from integrity_service.core.connectivity import connectivity_effect_overlaps_gap
    from integrity_service.core.scheduler import DeadlineScheduler
    from integrity_service.core.commands import EngineContext
    command = DeadlineScheduler(100, EngineContext(uuid4())).tick(100, {101})[0]
    assert command.kind == "auto_submit"
    assert not connectivity_effect_overlaps_gap(command, 0, 200)
