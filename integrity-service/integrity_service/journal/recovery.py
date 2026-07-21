"""Recovery for the append-only integrity journal."""

import errno
import fcntl
import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from integrity_service.core.schemas import EventBatch
from integrity_service.journal.encoding import encode_record


class JournalCorruption(ValueError):
    """Journal bytes violate framing, content, or identity invariants."""


class JournalLockUnavailable(RuntimeError):
    """The journal root is already owned by another writer or recovery."""


class _RecordParseFailure(Exception):
    """Typed internal parse failure; callers must decide whether it is recoverable."""


class _IncompleteRecord(_RecordParseFailure):
    """The current record ends before its declared framing is complete."""


class _MalformedRecord(_RecordParseFailure):
    """The current record has complete but non-canonical framing."""


class _InvalidPayload(_RecordParseFailure):
    """The digest is valid but the payload is not a valid EventBatch."""


class _DigestMismatch(_RecordParseFailure):
    """A fully framed record's declared digest does not match its payload."""

    def __init__(self, message: str, record_end: int) -> None:
        super().__init__(message)
        self.record_end = record_end


@dataclass(frozen=True)
class RecoveredRecord:
    batch: EventBatch
    encoded: bytes


@dataclass(frozen=True)
class RecoveryResult:
    records: tuple[RecoveredRecord, ...]
    truncated: bool

    @property
    def batch_count(self) -> int:
        return len(self.records)


def recover_journal(path: Path, *, _lock_fd: int | None = None) -> RecoveryResult:
    """Recover a journal while exclusively owning its root.

    A writer passes its lifetime lock descriptor through ``_lock_fd``. Standalone callers
    acquire the same non-blocking advisory lock for the entire read/validate/truncate cycle.
    """
    if not path.parent.exists():
        return RecoveryResult((), False)

    owned_lock_fd: int | None = None
    if _lock_fd is None:
        owned_lock_fd = _acquire_journal_lock(path)
    try:
        return _recover_locked(path)
    finally:
        if owned_lock_fd is not None:
            _release_journal_lock(owned_lock_fd)


def _recover_locked(path: Path) -> RecoveryResult:
    if not path.exists():
        return RecoveryResult((), False)

    content = path.read_bytes()
    records: list[RecoveredRecord] = []
    position = 0
    valid_end = 0
    while position < len(content):
        try:
            record, next_position = _decode_at(content, position)
        except _IncompleteRecord as error:
            if _incomplete_record_is_terminal(content, position):
                _truncate(path, valid_end)
                return RecoveryResult(tuple(records), True)
            raise JournalCorruption(str(error)) from error
        except _DigestMismatch as error:
            if error.record_end == len(content):
                _truncate(path, valid_end)
                return RecoveryResult(tuple(records), True)
            raise JournalCorruption(str(error)) from error
        except _RecordParseFailure as error:
            raise JournalCorruption(str(error)) from error
        records.append(record)
        position = next_position
        valid_end = position
    return RecoveryResult(tuple(records), False)


def _decode_at(content: bytes, position: int) -> tuple[RecoveredRecord, int]:
    header_end = position + 8
    available_header_end = min(header_end, len(content))
    header = content[position:available_header_end]
    if any(byte not in b"0123456789abcdef" for byte in header):
        raise _MalformedRecord("invalid journal length header")
    if available_header_end < header_end:
        raise _IncompleteRecord("incomplete journal length header")
    payload_length = int(header, 16)

    if header_end == len(content):
        raise _IncompleteRecord("incomplete journal length separator")
    if content[header_end] != ord(" "):
        raise _MalformedRecord("invalid journal length separator")

    digest_start = header_end + 1
    digest_end = digest_start + 64
    available_digest_end = min(digest_end, len(content))
    digest = content[digest_start:available_digest_end]
    if any(byte not in b"0123456789abcdef" for byte in digest):
        raise _MalformedRecord("invalid journal digest")
    if available_digest_end < digest_end:
        raise _IncompleteRecord("incomplete journal digest")

    if digest_end == len(content):
        raise _IncompleteRecord("incomplete journal digest separator")
    if content[digest_end] != ord(" "):
        raise _MalformedRecord("invalid journal digest separator")

    payload_start = digest_end + 1
    payload_end = payload_start + payload_length
    if payload_end > len(content):
        raise _IncompleteRecord("incomplete journal payload")
    if payload_end == len(content):
        raise _IncompleteRecord("incomplete journal record newline")
    if content[payload_end] != ord("\n"):
        raise _MalformedRecord("missing journal record newline")

    record_end = payload_end + 1
    payload = content[payload_start:payload_end]
    if hashlib.sha256(payload).hexdigest().encode("ascii") != digest:
        raise _DigestMismatch("journal payload digest mismatch", record_end)

    try:
        decoded = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise _InvalidPayload("invalid journal JSON payload") from error
    try:
        batch = EventBatch.model_validate(decoded)
    except ValidationError as error:
        raise _InvalidPayload("invalid journal batch schema") from error
    if encode_record(batch) != content[position:record_end]:
        raise _InvalidPayload("non-canonical journal payload")
    return RecoveredRecord(batch, content[position:record_end]), record_end


def _incomplete_record_is_terminal(content: bytes, position: int) -> bool:
    """Canonical payloads contain no raw newline, so one indicates later framed data."""
    return b"\n" not in content[position:]


def _lock_path(path: Path) -> Path:
    return path.with_name(f"{path.name}.lock")


def _acquire_journal_lock(path: Path) -> int:
    lock_fd = os.open(_lock_path(path), os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        os.close(lock_fd)
        if error.errno in (errno.EACCES, errno.EAGAIN):
            raise JournalLockUnavailable(f"journal root is already owned: {path.parent}") from error
        raise
    return lock_fd


def _release_journal_lock(lock_fd: int) -> None:
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
    finally:
        os.close(lock_fd)


def _truncate(path: Path, size: int) -> None:
    fd = os.open(path, os.O_RDWR)
    try:
        os.ftruncate(fd, size)
        os.fsync(fd)
    finally:
        os.close(fd)
