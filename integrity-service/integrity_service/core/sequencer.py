"""Per-device contiguous sequence acknowledgement."""

from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from integrity_service.core.schemas import EventBatch, EventRecord


class SequenceConflict(ValueError):
    """A device sequence number was reused for a different event."""


@dataclass(frozen=True)
class AcceptResult:
    acked_through_seq: int
    duplicate: bool
    new_records: tuple[EventRecord, ...]


class SessionSequencer:
    def __init__(self) -> None:
        self._acked: dict[tuple[int, str], int] = defaultdict(int)
        self._records: dict[tuple[int, str], dict[int, UUID]] = defaultdict(dict)

    def accept(self, batch: EventBatch) -> AcceptResult:
        session_key = (batch.participant_id, batch.device_id)
        seen = self._records.get(session_key, {})

        # Validate the complete batch before admitting any record. A later conflict must not
        # leave an earlier sequence visible to cursor advancement on a subsequent request.
        for record in batch.records:
            prior_id = seen.get(record.seq)
            if prior_id is not None and prior_id != record.event_id:
                raise SequenceConflict("same device sequence was reused with a different event_id")

        new_records = [record for record in batch.records if record.seq not in seen]
        committed = self._records[session_key]
        for record in new_records:
            committed[record.seq] = record.event_id
        cursor = self._advance(session_key)
        return AcceptResult(cursor, not new_records, tuple(new_records))

    def restore(self, participant_id: int, device_id: str, seq: int, event_id: UUID) -> None:
        """Rebuild recovered event state without invoking decision logic."""
        session_key = (participant_id, device_id)
        self._add_record(self._records[session_key], seq, event_id)
        self._advance(session_key)

    @staticmethod
    def _add_record(seen: dict[int, UUID], seq: int, event_id: UUID) -> bool:
        prior_id = seen.get(seq)
        if prior_id is not None and prior_id != event_id:
            raise SequenceConflict("same device sequence was reused with a different event_id")
        if prior_id is None:
            seen[seq] = event_id
            return True
        return False

    def _advance(self, session_key: tuple[int, str]) -> int:
        cursor = self._acked[session_key]
        seen = self._records[session_key]
        while cursor + 1 in seen:
            cursor += 1
        self._acked[session_key] = cursor
        return cursor
