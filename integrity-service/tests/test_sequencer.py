from uuid import UUID, uuid4

import pytest

from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.core.sequencer import SequenceConflict, SessionSequencer


def batch(first_seq: int, last_seq: int, *, event_ids: dict[int, UUID] | None = None) -> EventBatch:
    return EventBatch(
        schema_version=1,
        batch_id=uuid4(),
        run_id=uuid4(),
        participant_id=101,
        device_id="device-a",
        registry_version="2026-07-21.1",
        first_seq=first_seq,
        last_seq=last_seq,
        records=[
            EventRecord(
                event_id=(event_ids or {}).get(seq, uuid4()),
                seq=seq,
                kind="event",
                event_type="tab_hidden",
                event_schema_version=1,
                client_occurred_at_ms=1,
                client_recorded_at_ms=2,
                monotonic_ms=3.0,
            )
            for seq in range(first_seq, last_seq + 1)
        ],
        client_build="frontend-test",
    )


def test_sequencer_only_acks_contiguous_records():
    sequencer = SessionSequencer()
    assert sequencer.accept(batch(3, 4)).acked_through_seq == 0
    original = batch(1, 2)
    assert sequencer.accept(original).acked_through_seq == 4
    duplicate = sequencer.accept(original)
    assert duplicate.duplicate is True
    assert duplicate.acked_through_seq == 4


def test_sequencer_rejects_same_sequence_with_different_event_id():
    sequencer = SessionSequencer()
    sequencer.accept(batch(1, 1, event_ids={1: uuid4()}))

    with pytest.raises(SequenceConflict, match="different event_id"):
        sequencer.accept(batch(1, 1, event_ids={1: uuid4()}))


def test_failed_mixed_batch_does_not_admit_earlier_records():
    existing_event_two = uuid4()
    sequencer = SessionSequencer()
    sequencer.accept(batch(2, 2, event_ids={2: existing_event_two}))

    with pytest.raises(SequenceConflict, match="different event_id"):
        sequencer.accept(
            batch(
                1,
                2,
                event_ids={
                    1: uuid4(),
                    2: uuid4(),
                },
            )
        )

    valid_retry = sequencer.accept(batch(2, 2, event_ids={2: existing_event_two}))
    assert valid_retry.acked_through_seq == 0
    assert valid_retry.duplicate is True
    assert valid_retry.new_records == ()


def test_restore_rebuilds_cursor_without_creating_decisions():
    event_one = uuid4()
    event_two = uuid4()
    sequencer = SessionSequencer()
    sequencer.restore(101, "device-a", 2, event_two)
    sequencer.restore(101, "device-a", 1, event_one)

    result = sequencer.accept(batch(3, 3))
    assert result.acked_through_seq == 3
    assert len(result.new_records) == 1
