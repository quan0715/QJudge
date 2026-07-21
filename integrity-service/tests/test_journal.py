from uuid import uuid4

import pytest

from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.journal.recovery import JournalCorruption, recover_journal
from integrity_service.journal.writer import BatchIdentityConflict, JournalWriter


def batch(first_seq: int, last_seq: int, *, batch_id=None) -> EventBatch:
    return EventBatch(
        schema_version=1,
        batch_id=batch_id or uuid4(),
        run_id=uuid4(),
        participant_id=101,
        device_id="device-a",
        registry_version="2026-07-21.1",
        first_seq=first_seq,
        last_seq=last_seq,
        records=[
            EventRecord(
                event_id=uuid4(),
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


def test_recovery_truncates_partial_trailing_record(tmp_path):
    writer = JournalWriter(tmp_path)
    writer.append_batch_once(batch(1, 2))
    with writer.active_path.open("ab") as stream:
        stream.write(b"00000100 deadbeef partial")
    recovered = recover_journal(writer.active_path)
    assert [item.batch.first_seq for item in recovered.records] == [1]
    assert recovered.truncated is True


def test_same_batch_retry_is_not_appended_twice(tmp_path):
    writer = JournalWriter(tmp_path)
    original = batch(1, 2)
    assert writer.append_batch_once(original) is True
    assert writer.append_batch_once(original) is False
    assert recover_journal(writer.active_path).batch_count == 1


def test_writer_restart_rebuilds_idempotence_index(tmp_path):
    original = batch(1, 2)
    writer = JournalWriter(tmp_path)
    assert writer.append_batch_once(original) is True
    writer.close()

    restarted = JournalWriter(tmp_path)
    assert restarted.append_batch_once(original) is False
    assert recover_journal(restarted.active_path).batch_count == 1


def test_same_batch_id_with_different_content_conflicts(tmp_path):
    writer = JournalWriter(tmp_path)
    batch_id = uuid4()
    writer.append_batch_once(batch(1, 1, batch_id=batch_id))

    with pytest.raises(BatchIdentityConflict):
        writer.append_batch_once(batch(2, 2, batch_id=batch_id))


def test_recovery_preserves_mid_file_corruption_and_raises(tmp_path):
    writer = JournalWriter(tmp_path)
    writer.append_batch_once(batch(1, 1))
    writer.append_batch_once(batch(2, 2))
    original = writer.active_path.read_bytes()
    first_record_end = original.index(b"\n")
    replacement = b"0" if original[first_record_end - 1 : first_record_end] != b"0" else b"1"
    corrupted = (
        original[: first_record_end - 1] + replacement + original[first_record_end:]
    )
    writer.active_path.write_bytes(corrupted)

    with pytest.raises(JournalCorruption):
        recover_journal(writer.active_path)
    assert writer.active_path.read_bytes() == corrupted


def test_recovery_truncates_eof_hash_mismatch(tmp_path):
    writer = JournalWriter(tmp_path)
    writer.append_batch_once(batch(1, 1))
    original = writer.active_path.read_bytes()
    writer.active_path.write_bytes(original[:-2] + b"x\n")

    recovered = recover_journal(writer.active_path)
    assert recovered.batch_count == 0
    assert recovered.truncated is True
    assert writer.active_path.read_bytes() == b""
