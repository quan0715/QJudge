"""Durable, idempotent appends to the integrity journal."""

import hashlib
import json
import os
import threading
from pathlib import Path
from uuid import UUID

from integrity_service.core.schemas import EventBatch
from integrity_service.journal.recovery import recover_journal


class BatchIdentityConflict(ValueError):
    """A batch identifier was retried with different encoded content."""


def encode_record(batch: EventBatch) -> bytes:
    payload = json.dumps(
        batch.model_dump(mode="json", by_alias=True, exclude_none=True),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest().encode("ascii")
    return f"{len(payload):08x} ".encode("ascii") + digest + b" " + payload + b"\n"


class JournalWriter:
    def __init__(self, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.active_path = root / "active.journal"
        recovered = recover_journal(self.active_path)
        self._batch_digests: dict[UUID, bytes] = {
            item.batch.batch_id: hashlib.sha256(item.encoded).digest() for item in recovered.records
        }
        self._fd = os.open(self.active_path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
        self._lock = threading.Lock()

    def append_batch_once(self, batch: EventBatch) -> bool:
        encoded = encode_record(batch)
        digest = hashlib.sha256(encoded).digest()
        with self._lock:
            prior_digest = self._batch_digests.get(batch.batch_id)
            if prior_digest is not None:
                if prior_digest != digest:
                    raise BatchIdentityConflict(str(batch.batch_id))
                return False
            remaining = memoryview(encoded)
            while remaining:
                written = os.write(self._fd, remaining)
                if written <= 0:
                    raise OSError("journal write made no progress")
                remaining = remaining[written:]
            # Journal bytes are fsynced before append_batch_once returns True, enabling a durable ACK.
            os.fsync(self._fd)
            self._batch_digests[batch.batch_id] = digest
            return True

    def close(self) -> None:
        os.close(self._fd)
