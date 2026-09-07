"""Durable, idempotent appends to the integrity journal."""

import hashlib
import os
import threading
from pathlib import Path
from uuid import UUID

from integrity_service.core.schemas import EventBatch
from integrity_service.journal.durability import (
    ensure_durable_directory,
    open_durable_file,
)
from integrity_service.journal.encoding import encode_record
from integrity_service.journal.recovery import (
    JournalCorruption,
    RecoveredRecord,
    _acquire_journal_lock,
    _release_journal_lock,
    recover_journal,
)


class BatchIdentityConflict(ValueError):
    """A batch identifier was retried with different encoded content."""


class JournalWriterUnavailable(RuntimeError):
    """The writer cannot accept appends until it is closed and recovered."""


class JournalWriter:
    def __init__(self, root: Path) -> None:
        ensure_durable_directory(root)
        self.active_path = root / "active.journal"
        self._lock = threading.Lock()
        self._closed = False
        self._failed = False

        root_lock_fd = _acquire_journal_lock(self.active_path)
        journal_fd: int | None = None
        try:
            recovered = recover_journal(self.active_path, _lock_fd=root_lock_fd)
            batch_digests = _rebuild_batch_index(recovered.records)
            journal_fd = open_durable_file(
                self.active_path,
                os.O_APPEND | os.O_CREAT | os.O_WRONLY,
                0o600,
            )
            # A previous process may have written complete bytes but failed fsync.
            # Re-establish durability before recovered identities can return an ACK.
            while True:
                try:
                    os.fsync(journal_fd)
                    break
                except InterruptedError:
                    continue
        except BaseException:
            if journal_fd is not None:
                os.close(journal_fd)
            _release_journal_lock(root_lock_fd)
            raise

        self._root_lock_fd: int | None = root_lock_fd
        self._fd: int | None = journal_fd
        self._batch_digests = batch_digests

    def append_batch_once(self, batch: EventBatch) -> bool:
        with self._lock:
            self._require_available()
            encoded = encode_record(batch)
            digest = hashlib.sha256(encoded).digest()
            prior_digest = self._batch_digests.get(batch.batch_id)
            if prior_digest is not None:
                if prior_digest != digest:
                    raise BatchIdentityConflict(str(batch.batch_id))
                return False

            try:
                self._write_all(encoded)
                self._fsync()
            except BaseException:
                # The tail may now be partial or fully written but not known durable. Never let
                # this writer ACK a later append; close and reopen to reconcile under recovery.
                self._failed = True
                raise
            self._batch_digests[batch.batch_id] = digest
            return True

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            journal_fd = self._fd
            root_lock_fd = self._root_lock_fd
            self._fd = None
            self._root_lock_fd = None

            try:
                if journal_fd is not None:
                    os.close(journal_fd)
            finally:
                if root_lock_fd is not None:
                    _release_journal_lock(root_lock_fd)

    def __enter__(self) -> "JournalWriter":
        self._require_available()
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback) -> None:
        self.close()

    def _require_available(self) -> None:
        if self._closed:
            raise JournalWriterUnavailable("journal writer is closed")
        if self._failed:
            raise JournalWriterUnavailable(
                "journal writer requires close and recovery after an append failure"
            )

    def _write_all(self, encoded: bytes) -> None:
        assert self._fd is not None
        remaining = memoryview(encoded)
        while remaining:
            try:
                written = os.write(self._fd, remaining)
            except InterruptedError:
                continue
            if written <= 0:
                raise OSError("journal write made no progress")
            remaining = remaining[written:]

    def _fsync(self) -> None:
        assert self._fd is not None
        while True:
            try:
                os.fsync(self._fd)
                return
            except InterruptedError:
                continue


def _rebuild_batch_index(records: tuple[RecoveredRecord, ...]) -> dict[UUID, bytes]:
    batch_digests: dict[UUID, bytes] = {}
    for item in records:
        batch_id = item.batch.batch_id
        if batch_id in batch_digests:
            # A healthy writer never persists a duplicate frame, including byte-identical ones.
            raise JournalCorruption(f"journal contains repeated batch_id: {batch_id}")
        batch_digests[batch_id] = hashlib.sha256(item.encoded).digest()
    return batch_digests
