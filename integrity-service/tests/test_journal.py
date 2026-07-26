import hashlib
import json
import os
import subprocess
import sys
from uuid import uuid4

import pytest

from integrity_service.core.schemas import EventBatch, EventRecord
from integrity_service.journal.recovery import (
    JournalCorruption,
    JournalLockUnavailable,
    recover_journal,
)
from integrity_service.journal.writer import (
    BatchIdentityConflict,
    JournalWriter,
    JournalWriterUnavailable,
    encode_record,
)


def batch(first_seq: int, last_seq: int, *, batch_id=None) -> EventBatch:
    return EventBatch(
        schema_version=1,
        batch_id=batch_id or uuid4(),
        run_id=uuid4(),
        participant_id=101,
        device_id="device-a",
        registry_version="2026-07-21.2",
        first_seq=first_seq,
        last_seq=last_seq,
        records=[
            EventRecord(
                event_id=uuid4(),
                seq=seq,
                kind="event",
                event_type="mouse_leave_triggered",
                event_schema_version=1,
                client_occurred_at_ms=1,
                client_recorded_at_ms=2,
                monotonic_ms=3.0,
            )
            for seq in range(first_seq, last_seq + 1)
        ],
        client_build="frontend-test",
    )


def frame(payload: bytes) -> bytes:
    digest = hashlib.sha256(payload).hexdigest().encode("ascii")
    return f"{len(payload):08x} ".encode("ascii") + digest + b" " + payload + b"\n"


def assert_recovery_preserves_corruption(path, corrupted: bytes, match: str) -> None:
    path.write_bytes(corrupted)

    with pytest.raises(JournalCorruption, match=match):
        recover_journal(path)
    assert path.read_bytes() == corrupted


def test_recovery_truncates_partial_trailing_record(tmp_path):
    writer = JournalWriter(tmp_path)
    writer.append_batch_once(batch(1, 2))
    active_path = writer.active_path
    writer.close()
    with active_path.open("ab") as stream:
        stream.write(b"00000100 deadbeef")
    recovered = recover_journal(active_path)
    assert [item.batch.first_seq for item in recovered.records] == [1]
    assert recovered.truncated is True


def test_same_batch_retry_is_not_appended_twice(tmp_path):
    writer = JournalWriter(tmp_path)
    original = batch(1, 2)
    assert writer.append_batch_once(original) is True
    assert writer.append_batch_once(original) is False
    active_path = writer.active_path
    writer.close()
    assert recover_journal(active_path).batch_count == 1


def test_writer_restart_rebuilds_idempotence_index(tmp_path):
    original = batch(1, 2)
    writer = JournalWriter(tmp_path)
    assert writer.append_batch_once(original) is True
    writer.close()

    restarted = JournalWriter(tmp_path)
    assert restarted.append_batch_once(original) is False
    active_path = restarted.active_path
    restarted.close()
    assert recover_journal(active_path).batch_count == 1


def test_same_batch_id_with_different_content_conflicts(tmp_path):
    writer = JournalWriter(tmp_path)
    batch_id = uuid4()
    writer.append_batch_once(batch(1, 1, batch_id=batch_id))

    with pytest.raises(BatchIdentityConflict):
        writer.append_batch_once(batch(2, 2, batch_id=batch_id))
    writer.close()


def test_recovery_preserves_mid_file_corruption_and_raises(tmp_path):
    writer = JournalWriter(tmp_path)
    writer.append_batch_once(batch(1, 1))
    writer.append_batch_once(batch(2, 2))
    active_path = writer.active_path
    writer.close()
    original = active_path.read_bytes()
    first_record_end = original.index(b"\n")
    replacement = b"0" if original[first_record_end - 1 : first_record_end] != b"0" else b"1"
    corrupted = (
        original[: first_record_end - 1] + replacement + original[first_record_end:]
    )
    active_path.write_bytes(corrupted)

    with pytest.raises(JournalCorruption):
        recover_journal(active_path)
    assert active_path.read_bytes() == corrupted


def test_recovery_truncates_eof_hash_mismatch(tmp_path):
    writer = JournalWriter(tmp_path)
    writer.append_batch_once(batch(1, 1))
    active_path = writer.active_path
    writer.close()
    original = active_path.read_bytes()
    active_path.write_bytes(original[:-2] + b"x\n")

    recovered = recover_journal(active_path)
    assert recovered.batch_count == 0
    assert recovered.truncated is True
    assert active_path.read_bytes() == b""


@pytest.mark.parametrize(
    "invalid_header",
    [b"+0000001", b" 0000001", b"0000000A", b"0000000g"],
)
def test_recovery_preserves_noncanonical_terminal_length_header(tmp_path, invalid_header):
    encoded = encode_record(batch(1, 1))
    corrupted = invalid_header + encoded[8:]

    assert_recovery_preserves_corruption(
        tmp_path / "active.journal", corrupted, "invalid journal length header"
    )


@pytest.mark.parametrize("valid_prefix", [b"", encode_record(batch(1, 1))])
@pytest.mark.parametrize(
    ("tail", "message"),
    [
        (b"G", "invalid journal length header"),
        (b"00000000 G", "invalid journal digest"),
    ],
)
def test_recovery_preserves_invalid_short_framing_prefixes(
    tmp_path, valid_prefix, tail, message
):
    assert_recovery_preserves_corruption(
        tmp_path / "active.journal", valid_prefix + tail, message
    )


@pytest.mark.parametrize(
    ("offset", "replacement", "message"),
    [
        (8, b":", "invalid journal length separator"),
        (9, b"G", "invalid journal digest"),
        (73, b":", "invalid journal digest separator"),
        (-1, b"x", "missing journal record newline"),
    ],
)
def test_recovery_preserves_malformed_terminal_framing(
    tmp_path, offset, replacement, message
):
    corrupted = bytearray(encode_record(batch(1, 1)))
    if offset == -1:
        corrupted[-1:] = replacement
    else:
        corrupted[offset : offset + 1] = replacement

    assert_recovery_preserves_corruption(
        tmp_path / "active.journal", bytes(corrupted), message
    )


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (b"{", "invalid journal JSON payload"),
        (json.dumps({"schema_version": 1}).encode("utf-8"), "invalid journal batch schema"),
    ],
)
def test_recovery_preserves_valid_digest_invalid_terminal_payload(tmp_path, payload, message):
    corrupted = frame(payload)

    assert_recovery_preserves_corruption(tmp_path / "active.journal", corrupted, message)


def noncanonical_payload(kind: str, original: EventBatch) -> bytes:
    canonical = encode_record(original).split(b" ", 2)[2][:-1]
    if kind == "whitespace_unsorted":
        return json.dumps(
            original.model_dump(mode="json"), ensure_ascii=False, separators=(", ", ": ")
        ).encode("utf-8")
    if kind == "alternate_escape":
        record = original.records[0].model_copy(update={"payload": {"note": "臺灣"}})
        escaped = original.model_copy(update={"records": [record]})
        return json.dumps(
            escaped.model_dump(mode="json"),
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    if kind == "duplicate_key":
        return canonical.replace(b'"schema_version":1', b'"schema_version":1,"schema_version":1')
    raise AssertionError(f"unknown noncanonical payload kind: {kind}")


@pytest.mark.parametrize(
    "kind", ["whitespace_unsorted", "alternate_escape", "duplicate_key"]
)
def test_recovery_preserves_valid_checksum_noncanonical_payload(tmp_path, kind):
    original = batch(1, 1)
    corrupted = frame(noncanonical_payload(kind, original))

    assert_recovery_preserves_corruption(
        tmp_path / "active.journal", corrupted, "non-canonical journal payload"
    )


def test_canonical_retry_after_rejected_noncanonical_frame_has_no_identity_conflict(tmp_path):
    original = batch(1, 1)
    active_path = tmp_path / "active.journal"
    active_path.write_bytes(frame(noncanonical_payload("whitespace_unsorted", original)))

    with pytest.raises(JournalCorruption, match="non-canonical journal payload"):
        JournalWriter(tmp_path)

    active_path.write_bytes(encode_record(original))
    writer = JournalWriter(tmp_path)
    assert writer.append_batch_once(original) is False
    writer.close()


def test_recovery_truncates_exactly_final_complete_checksum_mismatch(tmp_path):
    first = encode_record(batch(1, 1))
    final = bytearray(encode_record(batch(2, 2)))
    payload_start = 8 + 1 + 64 + 1
    final[payload_start] = ord("[")
    active_path = tmp_path / "active.journal"
    active_path.write_bytes(first + final)

    recovered = recover_journal(active_path)

    assert recovered.truncated is True
    assert recovered.batch_count == 1
    assert active_path.read_bytes() == first


def test_recovery_preserves_incomplete_record_when_later_frame_exists(tmp_path):
    first = bytearray(encode_record(batch(1, 1)))
    first[:8] = b"ffffffff"
    corrupted = bytes(first) + encode_record(batch(2, 2))

    assert_recovery_preserves_corruption(
        tmp_path / "active.journal", corrupted, "incomplete journal payload"
    )


@pytest.mark.parametrize("same_content", [True, False])
def test_writer_rebuild_rejects_repeated_batch_id_frames(tmp_path, same_content):
    batch_id = uuid4()
    original = batch(1, 1, batch_id=batch_id)
    repeated = original if same_content else batch(2, 2, batch_id=batch_id)
    active_path = tmp_path / "active.journal"
    corrupted = encode_record(original) + encode_record(repeated)
    active_path.write_bytes(corrupted)

    with pytest.raises(JournalCorruption, match="repeated batch_id"):
        JournalWriter(tmp_path)
    assert active_path.read_bytes() == corrupted


def test_writer_retries_interrupted_write(tmp_path, monkeypatch):
    real_write = os.write
    calls = 0

    def interrupted_once(fd, data):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise InterruptedError("signal")
        return real_write(fd, data)

    writer = JournalWriter(tmp_path)
    with monkeypatch.context() as patch:
        patch.setattr("integrity_service.journal.writer.os.write", interrupted_once)
        assert writer.append_batch_once(batch(1, 1)) is True
    active_path = writer.active_path
    writer.close()

    assert calls >= 2
    assert recover_journal(active_path).batch_count == 1


def test_writer_retries_interrupted_fsync(tmp_path, monkeypatch):
    real_fsync = os.fsync
    calls = 0

    def interrupted_once(fd):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise InterruptedError("signal")
        return real_fsync(fd)

    writer = JournalWriter(tmp_path)
    with monkeypatch.context() as patch:
        patch.setattr("integrity_service.journal.writer.os.fsync", interrupted_once)
        assert writer.append_batch_once(batch(1, 1)) is True
    active_path = writer.active_path
    writer.close()

    assert calls >= 2
    assert recover_journal(active_path).batch_count == 1


def test_partial_write_failure_blocks_writer_and_retry_recovers_tail(tmp_path, monkeypatch):
    original = batch(1, 1)
    real_write = os.write
    calls = 0

    def partial_then_fail(fd, data):
        nonlocal calls
        calls += 1
        if calls == 1:
            return real_write(fd, data[: len(data) // 2])
        raise OSError("injected disk failure")

    writer = JournalWriter(tmp_path)
    with monkeypatch.context() as patch:
        patch.setattr("integrity_service.journal.writer.os.write", partial_then_fail)
        with pytest.raises(OSError, match="injected disk failure"):
            writer.append_batch_once(original)
        with pytest.raises(JournalWriterUnavailable, match="recovery"):
            writer.append_batch_once(batch(2, 2))
    writer.close()

    restarted = JournalWriter(tmp_path)
    assert restarted.append_batch_once(original) is True
    assert restarted.append_batch_once(original) is False
    active_path = restarted.active_path
    restarted.close()
    assert recover_journal(active_path).batch_count == 1


def test_fsync_failure_blocks_writer_and_reopen_finds_complete_frame(tmp_path, monkeypatch):
    original = batch(1, 1)

    def fail_fsync(_fd):
        raise OSError("injected fsync failure")

    writer = JournalWriter(tmp_path)
    with monkeypatch.context() as patch:
        patch.setattr("integrity_service.journal.writer.os.fsync", fail_fsync)
        with pytest.raises(OSError, match="injected fsync failure"):
            writer.append_batch_once(original)
        with pytest.raises(JournalWriterUnavailable, match="recovery"):
            writer.append_batch_once(batch(2, 2))
    writer.close()

    restarted = JournalWriter(tmp_path)
    assert restarted.append_batch_once(original) is False
    active_path = restarted.active_path
    restarted.close()
    assert recover_journal(active_path).batch_count == 1


def test_recovery_cannot_run_while_writer_owns_journal(tmp_path):
    writer = JournalWriter(tmp_path)

    with pytest.raises(JournalLockUnavailable, match="already owned"):
        recover_journal(writer.active_path)

    writer.close()
    assert recover_journal(writer.active_path).batch_count == 0


def test_journal_root_lock_is_exclusive_across_processes_and_released_on_close(tmp_path):
    script = """
import sys
from pathlib import Path
from integrity_service.journal.recovery import JournalLockUnavailable
from integrity_service.journal.writer import JournalWriter

try:
    writer = JournalWriter(Path(sys.argv[1]))
except JournalLockUnavailable:
    print("locked")
    raise SystemExit(23)
else:
    writer.close()
    print("acquired")
"""
    writer = JournalWriter(tmp_path)
    blocked = subprocess.run(
        [sys.executable, "-c", script, str(tmp_path)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert blocked.returncode == 23
    assert blocked.stdout.strip() == "locked"

    writer.close()
    acquired = subprocess.run(
        [sys.executable, "-c", script, str(tmp_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert acquired.returncode == 0
    assert acquired.stdout.strip() == "acquired"
