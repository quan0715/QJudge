from uuid import UUID, uuid4

import pytest

from integrity_service.core.commands import EngineContext, make_command
from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.core.sequencer import SequenceConflict, SessionSequencer


RUN_ID = UUID("00000000-0000-0000-0000-000000000555")


def batch(
    first_seq: int,
    last_seq: int,
    *,
    event_ids: dict[int, UUID] | None = None,
    event_types: dict[int, str] | None = None,
) -> EventBatch:
    return EventBatch(
        schema_version=1,
        batch_id=uuid4(),
        run_id=RUN_ID,
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
                event_type=(event_types or {}).get(seq, "tab_hidden"),
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
    restored_two = batch(2, 2, event_ids={2: event_two}).records[0]
    restored_one = batch(1, 1, event_ids={1: event_one}).records[0]
    sequencer.restore(RUN_ID, 101, "device-a", restored_two)
    sequencer.restore(RUN_ID, 101, "device-a", restored_one)

    result = sequencer.accept(batch(3, 3))
    assert result.acked_through_seq == 3
    assert len(result.new_records) == 1


@pytest.mark.parametrize(
    ("first_type", "second_type"),
    [
        ("exit_fullscreen_triggered", "fullscreen_restored"),
        ("tab_hidden", "copy_attempt"),
    ],
)
def test_sequencer_rejects_event_uuid_reused_at_another_sequence_before_decisions(
    first_type, second_type
):
    event_id = uuid4()
    sequencer = SessionSequencer()
    sequencer.accept(batch(1, 1, event_ids={1: event_id}, event_types={1: first_type}))

    with pytest.raises(SequenceConflict, match="event_id was reused"):
        sequencer.accept(batch(2, 2, event_ids={2: event_id}, event_types={2: second_type}))


def test_sequencer_filters_exact_retry_but_rejects_same_identity_changed_content():
    event_id = uuid4()
    original = batch(1, 1, event_ids={1: event_id})
    sequencer = SessionSequencer()
    first = sequencer.accept(original)
    retry = sequencer.accept(original)

    assert len(first.new_records) == 1
    assert retry.duplicate is True
    assert retry.new_records == ()

    changed_record = original.records[0].model_copy(update={"payload": {"changed": True}})
    changed = original.model_copy(update={"records": [changed_record]})
    with pytest.raises(SequenceConflict, match="different content"):
        sequencer.accept(changed)


def test_failed_reused_uuid_batch_is_atomic():
    event_id = uuid4()
    sequencer = SessionSequencer()
    sequencer.accept(batch(2, 2, event_ids={2: event_id}))

    with pytest.raises(SequenceConflict, match="event_id was reused"):
        sequencer.accept(batch(1, 2, event_ids={1: event_id, 2: uuid4()}))

    assert sequencer.accept(batch(2, 2, event_ids={2: event_id})).acked_through_seq == 0


@pytest.mark.parametrize(
    ("first_type", "reused_type"),
    [
        ("exit_fullscreen_triggered", "fullscreen_restored"),
        ("tab_hidden", "copy_attempt"),
    ],
)
def test_reused_uuid_that_would_alias_different_command_values_never_reaches_decisions(
    first_type, reused_type
):
    event_id = uuid4()
    sequencer = SessionSequencer()
    accepted = sequencer.accept(
        batch(1, 1, event_ids={1: event_id}, event_types={1: first_type})
    )
    first_record = accepted.new_records[0]
    emitted = make_command(
        context=EngineContext(RUN_ID),
        kind="record_event",
        participant_id=101,
        device_id="device-a",
        incident_id=None,
        event_id=first_record.event_id,
        phase="triggered",
        event_type=first_record.event_type,
        action="record",
        client_occurred_at_ms=first_record.client_occurred_at_ms,
        received_at_server_ms=1,
    )
    hypothetical_conflict = make_command(
        context=EngineContext(RUN_ID),
        kind="record_event",
        participant_id=101,
        device_id="device-a",
        incident_id=None,
        event_id=event_id,
        phase="triggered",
        event_type=reused_type,
        action="audit",
        client_occurred_at_ms=2,
        received_at_server_ms=2,
    )
    assert hypothetical_conflict.command_id == emitted.command_id
    assert hypothetical_conflict != emitted

    with pytest.raises(SequenceConflict, match="event_id was reused"):
        sequencer.accept(
            batch(2, 2, event_ids={2: event_id}, event_types={2: reused_type})
        )

    commands_by_id = {emitted.command_id: emitted}
    assert commands_by_id == {emitted.command_id: emitted}
