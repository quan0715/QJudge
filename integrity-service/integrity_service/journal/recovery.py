"""Recovery for the append-only integrity journal."""

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

from integrity_service.core.schemas import EventBatch


class JournalCorruption(ValueError):
    """A non-trailing journal record is malformed or has an invalid digest."""


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


def recover_journal(path: Path) -> RecoveryResult:
    if not path.exists():
        return RecoveryResult((), False)

    content = path.read_bytes()
    records: list[RecoveredRecord] = []
    position = 0
    valid_end = 0
    while position < len(content):
        try:
            record, next_position = _decode_at(content, position)
        except ValueError as error:
            if _is_trailing_record(content, position):
                _truncate(path, valid_end)
                return RecoveryResult(tuple(records), True)
            raise JournalCorruption(str(error)) from error
        records.append(record)
        position = next_position
        valid_end = position
    return RecoveryResult(tuple(records), False)


def _decode_at(content: bytes, position: int) -> tuple[RecoveredRecord, int]:
    header_end = position + 8
    if header_end > len(content):
        raise ValueError("incomplete journal length header")
    header = content[position:header_end]
    try:
        payload_length = int(header, 16)
    except ValueError as error:
        raise ValueError("invalid journal length header") from error
    if content[header_end : header_end + 1] != b" ":
        raise ValueError("invalid journal length separator")

    digest_start = header_end + 1
    digest_end = digest_start + 64
    if digest_end > len(content):
        raise ValueError("incomplete journal digest")
    digest = content[digest_start:digest_end]
    if len(digest) != 64 or any(byte not in b"0123456789abcdef" for byte in digest):
        raise ValueError("invalid journal digest")
    if content[digest_end : digest_end + 1] != b" ":
        raise ValueError("invalid journal digest separator")

    payload_start = digest_end + 1
    payload_end = payload_start + payload_length
    if payload_end >= len(content):
        raise ValueError("incomplete journal payload")
    if content[payload_end : payload_end + 1] != b"\n":
        raise ValueError("missing journal record newline")
    payload = content[payload_start:payload_end]
    if hashlib.sha256(payload).hexdigest().encode("ascii") != digest:
        raise ValueError("journal payload digest mismatch")
    try:
        batch = EventBatch.model_validate(json.loads(payload))
    except (json.JSONDecodeError, ValueError) as error:
        raise ValueError("invalid journal batch payload") from error
    return RecoveredRecord(batch, content[position : payload_end + 1]), payload_end + 1


def _is_trailing_record(content: bytes, position: int) -> bool:
    """An invalid record is recoverable only when it is the file's final record."""
    # A newline after the broken record's start means a later complete record may exist.
    # In that case preserve bytes for investigation rather than discarding evidence.
    return b"\n" not in content[position:-1]


def _truncate(path: Path, size: int) -> None:
    fd = os.open(path, os.O_RDWR)
    try:
        os.ftruncate(fd, size)
        os.fsync(fd)
    finally:
        os.close(fd)
