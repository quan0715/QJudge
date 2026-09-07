from uuid import UUID

import pytest
from pydantic import ValidationError

from integrity_service.core.schemas import EventBatch
from integrity_service.journal.writer import BatchIdentityConflict
from test_resident_receipts import runtime
from test_worker_api import batch_payload, NOW_MS

ATTEMPT = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def fenced(seq, before, *, event_type="health_snapshot"):
    value = batch_payload(event_type=event_type, payload={})
    value["first_seq"] = value["last_seq"] = seq
    record = value["records"][0]
    record.update(seq=seq, kind="health_snapshot", client_occurred_at_ms=before + 60000)
    record["payload"]["evidence_fence"] = {
        "version": "resident-evidence-fence-v1", "attempt_id": str(ATTEMPT),
        "through_seq": seq, "before_client_ms": before,
    }
    return value


def test_fence_needs_continuous_decisions_and_survives_replay(tmp_path):
    first = runtime(tmp_path)
    value = EventBatch.model_validate(fenced(2, 100000))
    first.accept_batch(value, NOW_MS, attempt_id=ATTEMPT)
    first.process_pending(1)
    assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 0
    first.accept_batch(EventBatch.model_validate(fenced(1, 90000)), NOW_MS + 1, attempt_id=ATTEMPT)
    assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 0
    first.process_pending(1)
    assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 100000
    first.close()
    second = runtime(tmp_path)
    try:
        assert second.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 100000
        assert second.student_progress(101, "other-device", ATTEMPT)["release_evidence_before_ms"] == 0
        assert second.student_progress(101, "device-a", UUID(int=7))["release_evidence_before_ms"] == 0
        changed = value.model_copy(deep=True)
        changed.records[0].payload["evidence_fence"]["before_client_ms"] = 100001
        with pytest.raises(BatchIdentityConflict):
            second.accept_batch(changed, NOW_MS + 2, attempt_id=ATTEMPT)
    finally:
        second.close()


@pytest.mark.parametrize("field,value", [("version", "v2"), ("through_seq", 2), ("before_client_ms", -1)])
def test_fence_schema_rejects_unknown_or_nonatomic_boundary(field, value):
    payload = fenced(1, 100)
    payload["records"][0]["payload"]["evidence_fence"][field] = value
    with pytest.raises(ValidationError):
        EventBatch.model_validate(payload)


def test_legacy_progress_never_claims_fence(tmp_path):
    first = runtime(tmp_path)
    try:
        first.accept_batch(EventBatch.model_validate(batch_payload()), NOW_MS)
        first.process_pending(1)
        assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 0
    finally:
        first.close()


def event(seq, at, name="exit_fullscreen_triggered"):
    value = batch_payload(event_type=name)
    value["first_seq"] = value["last_seq"] = seq
    value["records"][0].update(seq=seq, client_occurred_at_ms=at)
    return EventBatch.model_validate(value)


def test_open_incident_and_pending_escalation_protect_original_anchor(tmp_path):
    first = runtime(tmp_path)
    try:
        trigger = event(1, 100000)
        first.accept_batch(trigger, NOW_MS, attempt_id=ATTEMPT)
        first.process_pending(1)
        first.accept_batch(EventBatch.model_validate(fenced(2, 500000)), NOW_MS + 40000, attempt_id=ATTEMPT)
        first.process_pending(1)
        assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 90000
        escalated = next(c for c in first.outbox.pending_commands if c["event_type"] == "exit_fullscreen")
        assert escalated["metadata"]["receipt_batch_id"] == str(trigger.batch_id)
        assert escalated["client_occurred_at_ms"] == 100000
        first.accept_batch(event(3, 510000, "fullscreen_restored"), NOW_MS + 41000, attempt_id=ATTEMPT)
        first.process_pending(1)
        assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 90000
        first.outbox.deliver_pending(first.backend)
        assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 500000
    finally:
        first.close()


def test_late_callback_keeps_original_policy_and_truthful_gap_after_clock_regression(tmp_path):
    first = runtime(tmp_path)
    try:
        first.accept_batch(EventBatch.model_validate(fenced(1, 500000)), NOW_MS, attempt_id=ATTEMPT)
        first.process_pending(1)
        first.accept_batch(event(2, 123000), NOW_MS + 1, attempt_id=ATTEMPT)
        first.process_pending(1)
        first.accept_batch(EventBatch.model_validate(fenced(3, 100000)), NOW_MS + 40000, attempt_id=ATTEMPT)
        first.process_pending(1)
        escalated = next(c for c in first.outbox.pending_commands if c["event_type"] == "exit_fullscreen")
        assert escalated["action"] == "pause"  # Genuine fullscreen rule is unchanged.
        assert escalated["client_occurred_at_ms"] == 123000
        assert escalated["metadata"]["evidence_gap"]["reason"] == "late_beyond_fence"
        assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 500000
        expected = first.outbox.pending_commands
    finally:
        first.close()
    second = runtime(tmp_path)
    try:
        assert second.outbox.pending_commands == expected
    finally:
        second.close()


def test_signal_after_fence_inside_same_batch_is_explicitly_late(tmp_path):
    value = fenced(1, 500000)
    value["records"] += event(2, 123000).model_dump(mode="json")["records"]
    value["last_seq"] = 2
    first = runtime(tmp_path)
    try:
        first.accept_batch(EventBatch.model_validate(value), NOW_MS, attempt_id=ATTEMPT)
        first.process_pending(1)
        command = next(c for c in first.outbox.pending_commands if c["event_type"] == "exit_fullscreen_triggered")
        assert command["metadata"]["evidence_gap"]["reason"] == "late_beyond_fence"
    finally:
        first.close()


def test_healthy_ten_minute_exam_fences_advance_without_incidents(tmp_path):
    first = runtime(tmp_path)
    try:
        for seq in range(1, 122):
            now = NOW_MS + seq * 5000
            first.accept_batch(EventBatch.model_validate(fenced(seq, now - 60000)), now, attempt_id=ATTEMPT)
            first.process_pending(1)
            assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == now - 60000
        assert not first.outbox.pending_commands
    finally:
        first.close()


def test_prior_attempt_escalation_is_not_reassigned_to_new_attempt(tmp_path):
    first = runtime(tmp_path)
    trigger = event(1, 100000)
    new_attempt = UUID(int=7)
    try:
        first.accept_batch(trigger, NOW_MS, attempt_id=ATTEMPT)
        first.process_pending(1)
        payload = fenced(2, 500000)
        payload["records"][0]["payload"]["evidence_fence"]["attempt_id"] = str(new_attempt)
        first.accept_batch(EventBatch.model_validate(payload), NOW_MS + 40000, attempt_id=new_attempt)
        first.process_pending(1)
        escalation = next(c for c in first.outbox.pending_commands if c["event_type"] == "exit_fullscreen")
        assert escalation["metadata"]["receipt_batch_id"] == str(trigger.batch_id)
        assert first.student_progress(101, "device-a", new_attempt)["release_evidence_before_ms"] == 500000
        before = first.outbox.pending_commands
    finally:
        first.close()
    second = runtime(tmp_path)
    try:
        assert second.outbox.pending_commands == before
    finally:
        second.close()


def test_legacy_command_provenance_replays_unchanged_after_upgrade(tmp_path):
    first = runtime(tmp_path)
    first.accept_batch(event(1, 100000), NOW_MS)
    first.process_pending(1)
    later = event(2, 200000, "fullscreen_restored")
    first.accept_batch(later, NOW_MS + 40000)
    first.process_pending(1)
    before = first.outbox.pending_commands
    assert next(c for c in before if c["event_type"] == "exit_fullscreen")["metadata"]["receipt_batch_id"] == str(later.batch_id)
    first.close()
    second = runtime(tmp_path)
    try:
        # A new gateway's retry cannot reinterpret the original unversioned WAL.
        second.accept_batch(later, NOW_MS + 40001, attempt_id=ATTEMPT)
        assert second.outbox.pending_commands == before
    finally:
        second.close()


def test_fence_crash_before_processed_commit_recovers_without_premature_progress(tmp_path, monkeypatch):
    first = runtime(tmp_path)
    first.accept_batch(EventBatch.model_validate(fenced(1, 500000)), NOW_MS, attempt_id=ATTEMPT)
    def fail(_):
        raise OSError("crash before processed marker")
    monkeypatch.setattr(first.receipts, "mark_processed", fail)
    with pytest.raises(OSError):
        first.process_pending(1)
    with pytest.raises(OSError):
        first.student_progress(101, "device-a", ATTEMPT)
    first.close()
    second = runtime(tmp_path)
    try:
        assert second.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 500000
        assert second.process_pending(10) == 0
    finally:
        second.close()


def test_clock_regression_alone_never_creates_misconduct_or_lowers_fence(tmp_path):
    first = runtime(tmp_path)
    try:
        for seq, before in [(1, 500000), (2, 100000)]:
            first.accept_batch(EventBatch.model_validate(fenced(seq, before)), NOW_MS + seq * 5000, attempt_id=ATTEMPT)
            first.process_pending(1)
        assert first.student_progress(101, "device-a", ATTEMPT)["release_evidence_before_ms"] == 500000
        assert not first.outbox.pending_commands
    finally:
        first.close()
