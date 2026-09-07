"""Resident intake must survive process loss without running decision or network I/O."""

from uuid import uuid4
import os
import subprocess
import sys

import pytest

from integrity_service.core.schemas import EventBatch
from integrity_service.core.sequencer import SequenceConflict
from integrity_service.journal.writer import BatchIdentityConflict
from integrity_service.worker.runtime import WorkerRuntime, RunMismatch, WorkerNotAccepting
from test_worker_api import bootstrap, batch_payload, FakeBackend, VALID_PUBLIC_KEY_B64, NOW_MS


def runtime(root, backend=None):
    return WorkerRuntime(
        bootstrap=bootstrap(VALID_PUBLIC_KEY_B64), data_root=root,
        backend=backend or FakeBackend(), resident_mode=True,
    )


def batch(seq=1):
    payload = batch_payload()
    payload.update(first_seq=seq, last_seq=seq)
    payload["records"][0]["seq"] = seq
    return EventBatch.model_validate(payload)


def test_durable_receipt_survives_backend_outage_and_restart(tmp_path):
    backend = FakeBackend()
    backend.failures_remaining = 100
    value = batch()
    first = runtime(tmp_path, backend)
    try:
        ack = first.accept_batch(value, NOW_MS)
        assert ack.acked_through_seq == 1
        assert ack.pending_commands == []
        assert ack.release_evidence_before_ms == 0
        assert backend.command_batches == []
        assert first.outbox.pending_commands == ()
    finally:
        first.close()
    second = runtime(tmp_path, backend)
    try:
        assert second.outbox.pending_commands == ()
        assert second.accept_batch(value, NOW_MS + 100_000).acked_through_seq == 1
        assert second.process_pending(limit=10) == 1
        assert second.process_pending(limit=10) == 0
        assert second.outbox.pending_commands
        assert backend.command_batches == []
        assert second.outbox.pending_commands[0]["received_at_server_ms"] == NOW_MS
    finally:
        second.close()


def test_multiple_receipts_replay_in_receive_order_and_keep_contiguous_ack(tmp_path):
    first = runtime(tmp_path)
    values = [batch(3), batch(1), batch(2)]
    try:
        for offset, (value, expected) in enumerate(zip(values, [0, 1, 3])):
            assert first.accept_batch(value, NOW_MS + offset).acked_through_seq == expected
        first.tick(NOW_MS + 100_000)
        assert first.timeline_journal.last_server_ms == NOW_MS
    finally:
        first.close()
    second = runtime(tmp_path)
    try:
        assert second.process_pending(limit=2) == 2
        assert second.process_pending(limit=2) == 1
        entries = second.timeline_journal.records[1:]
        assert [item["batch_id"] for item in entries] == [str(value.batch_id) for value in values]
        assert [item["server_ms"] for item in entries] == [NOW_MS, NOW_MS + 1, NOW_MS + 2]
        assert second.accept_batch(values[0], NOW_MS + 3).acked_through_seq == 3
        assert second.process_pending(limit=2) == 0
    finally:
        second.close()


def test_conflicts_do_not_poison_durable_intake(tmp_path):
    first = runtime(tmp_path)
    original = batch()
    try:
        first.accept_batch(original, NOW_MS)
        changed = original.model_copy(deep=True)
        changed.records[0].payload = {"reason": "changed"}
        with pytest.raises(BatchIdentityConflict):
            first.accept_batch(changed, NOW_MS + 1)
        changed.batch_id = uuid4()
        with pytest.raises(SequenceConflict):
            first.accept_batch(changed, NOW_MS + 2)
        assert first.healthy
        assert first.accept_batch(batch(2), NOW_MS + 3).acked_through_seq == 2
        assert len(first.journal.recovered_batches) == 2
    finally:
        first.close()
    second = runtime(tmp_path)
    try:
        assert second.process_pending(10) == 2
    finally:
        second.close()


def test_fsync_failure_never_leaks_ack_before_recovery(tmp_path, monkeypatch):
    first = runtime(tmp_path)
    value = batch()
    writer = first.journal._writer
    def fail():
        raise OSError("disk failed")
    monkeypatch.setattr(writer, "_fsync", fail)
    try:
        with pytest.raises(OSError):
            first.accept_batch(value, NOW_MS)
        with pytest.raises(OSError):
            first.accept_batch(value, NOW_MS + 1)
        with pytest.raises(OSError):
            first.receipts.append_durable(value, NOW_MS + 1)
        assert not first.healthy
    finally:
        first.close()
    second = runtime(tmp_path)
    try:
        assert second.accept_batch(value, NOW_MS + 2).acked_through_seq == 1
        assert second.process_pending(10) == 1
    finally:
        second.close()


def test_receipt_fsync_failure_and_failed_store_reject_retries(tmp_path, monkeypatch):
    first = runtime(tmp_path)
    value = batch()
    original = os.fsync
    def fail_receipt(fd):
        if fd == first.receipts._log._fd:
            raise OSError("receipt disk full")
        original(fd)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(os, "fsync", fail_receipt)
            with pytest.raises(OSError):
                first.accept_batch(value, NOW_MS)
        with pytest.raises(OSError):
            first.accept_batch(value, NOW_MS + 1)
        with pytest.raises(OSError):
            first.receipts.append_durable(value, NOW_MS + 1)
    finally:
        first.close()
    second = runtime(tmp_path)
    try:
        assert second.accept_batch(value, NOW_MS + 2).acked_through_seq == 1
        assert second.process_pending(10) == 1
    finally:
        second.close()


@pytest.mark.parametrize("log_path", ["receipts/receipts.log", "journal/active.journal",
                                      "timeline/timeline.log", "outbox/commands.log"])
def test_recovery_must_fsync_surviving_bytes_before_reusing_durable_state(tmp_path, monkeypatch, log_path):
    first = runtime(tmp_path)
    try:
        first.accept_batch(batch(), NOW_MS)
        first.process_pending(1)
        path = tmp_path / str(first.run_id) / log_path
    finally:
        first.close()
    inode = path.stat().st_ino
    original = os.fsync
    def fail_survivor(fd):
        if os.fstat(fd).st_ino == inode:
            raise OSError("cannot establish recovered durability")
        original(fd)
    with monkeypatch.context() as patch:
        patch.setattr(os, "fsync", fail_survivor)
        with pytest.raises(OSError):
            reopened = runtime(tmp_path)
            reopened.close()
    recovered = runtime(tmp_path)
    try:
        assert recovered.process_pending(1) == 0
    finally:
        recovered.close()


def test_intake_snapshots_batch_and_rejects_cross_run_before_writing(tmp_path):
    first = runtime(tmp_path)
    value = batch()
    retry = value.model_copy(deep=True)
    try:
        wrong_run = value.model_copy(update={"run_id": uuid4()})
        with pytest.raises(RunMismatch):
            first.accept_batch(wrong_run, NOW_MS)
        assert first.journal.recovered_batches == ()
        first.accept_batch(value, NOW_MS)
        value.records[0].payload["reason"] = "caller mutation"
        assert first.accept_batch(retry, NOW_MS + 1).acked_through_seq == 1
        assert first.process_pending(1) == 1
        assert first.timeline_journal.records[1]["records"][0]["payload"] == {"reason": "test"}
    finally:
        first.close()


def test_resident_mode_cannot_use_legacy_ingest_or_archive(tmp_path):
    first = runtime(tmp_path)
    try:
        with pytest.raises(ValueError):
            first.ingest(batch(), NOW_MS)
        with pytest.raises(WorkerNotAccepting):
            first.stop()
        assert first.accepting
    finally:
        first.close()
    with pytest.raises(ValueError):
        WorkerRuntime(bootstrap=bootstrap(VALID_PUBLIC_KEY_B64), data_root=tmp_path,
                      backend=FakeBackend())


@pytest.mark.parametrize("crash_at", ["receipt", "ack", "decision", "outbox", "cursor"])
def test_real_process_exit_recovers_receipts_and_decisions(tmp_path, crash_at):
    # os._exit bypasses every close/finally hook: this is process loss, not a graceful reopen.
    script = '''
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / "tests"))
from test_resident_receipts import runtime, batch, NOW_MS
r = runtime(Path(sys.argv[1]))
point = sys.argv[2]
if point != "ack":
    log = {"receipt": r.receipts._log, "decision": r.timeline_journal._log,
           "outbox": r.outbox._log, "cursor": r.receipts._log}[point]
    original = log.append
    def append(record):
        original(record)
        if point != "cursor" or record.get("kind") == "processed":
            os._exit(77)
    log.append = append
assert r.accept_batch(batch(), NOW_MS).acked_through_seq == 1
if point == "ack":
    os._exit(77)
r.process_pending(10)
'''
    result = subprocess.run([sys.executable, "-c", script, str(tmp_path), crash_at],
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 77, result.stderr
    second = runtime(tmp_path)
    try:
        assert second.process_pending(10) == (1 if crash_at in {"receipt", "ack"} else 0)
        assert second.process_pending(10) == 0
        assert len(second.journal.recovered_batches) == 1
        assert len(second.timeline_journal.records) == 2
        assert second.timeline_journal.records[1]["server_ms"] == NOW_MS
        commands = second.outbox.pending_commands
        assert commands
    finally:
        second.close()
    third = runtime(tmp_path)
    try:
        assert third.process_pending(10) == 0
        assert third.outbox.pending_commands == commands
    finally:
        third.close()


@pytest.mark.parametrize("crash_at", ["raw_projection", "outbox", "processed_cursor"])
def test_crash_windows_recover_exactly_one_decision(tmp_path, monkeypatch, crash_at):
    first = runtime(tmp_path)
    value = batch()
    def crash(*args, **kwargs):
        raise OSError("injected process loss")
    try:
        if crash_at == "raw_projection":
            monkeypatch.setattr(first.journal, "append_batch_once", crash)
            with pytest.raises(OSError):
                first.accept_batch(value, NOW_MS)
        else:
            first.accept_batch(value, NOW_MS)
            target = first.outbox if crash_at == "outbox" else first.receipts
            method = "append" if crash_at == "outbox" else "mark_processed"
            monkeypatch.setattr(target, method, crash)
            with pytest.raises(OSError):
                first.process_pending(10)
    finally:
        first.close()
    second = runtime(tmp_path)
    try:
        assert second.accept_batch(value, NOW_MS + 100_000).acked_through_seq == 1
        assert second.process_pending(10) == (1 if crash_at == "raw_projection" else 0)
        commands = second.outbox.pending_commands
        assert commands
        assert len({c["command_id"] for c in commands}) == len(commands)
        assert len(second.timeline_journal.records) == 2
        assert second.timeline_journal.records[1]["server_ms"] == NOW_MS
    finally:
        second.close()
    third = runtime(tmp_path)
    try:
        assert third.process_pending(10) == 0
        assert third.outbox.pending_commands == commands
    finally:
        third.close()
