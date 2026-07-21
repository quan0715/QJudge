"""Per-device contiguous sequence acknowledgement."""

from collections import defaultdict
from dataclasses import dataclass
import json
from uuid import UUID

from integrity_service.core.schemas import EventBatch, EventRecord


class SequenceConflict(ValueError):
    """A device sequence number was reused for a different event."""


@dataclass(frozen=True)
class AcceptResult:
    acked_through_seq: int
    duplicate: bool
    new_records: tuple[EventRecord, ...]


@dataclass(frozen=True, slots=True)
class _RecordIdentity:
    event_id: UUID
    canonical_content: str


class SessionSequencer:
    def __init__(self) -> None:
        self._acked: dict[tuple[UUID, int, str], int] = defaultdict(int)
        self._records: dict[
            tuple[UUID, int, str], dict[int, _RecordIdentity]
        ] = defaultdict(dict)
        self._event_sequences: dict[
            tuple[UUID, int, str], dict[UUID, int]
        ] = defaultdict(dict)

    def accept(self, batch: EventBatch) -> AcceptResult:
        session_key = (batch.run_id, batch.participant_id, batch.device_id)
        seen = self._records.get(session_key, {})
        event_sequences = self._event_sequences.get(session_key, {})
        prospective_seen = dict(seen)
        prospective_event_sequences = dict(event_sequences)

        # Validate the complete batch before admitting any record. A later conflict must not
        # leave an earlier sequence visible to cursor advancement on a subsequent request.
        for record in batch.records:
            identity = self._identity(record)
            prior = prospective_seen.get(record.seq)
            if prior is not None:
                if prior.event_id != record.event_id:
                    raise SequenceConflict(
                        "same device sequence was reused with a different event_id"
                    )
                if prior.canonical_content != identity.canonical_content:
                    raise SequenceConflict(
                        "same sequence and event_id were reused with different content"
                    )
                continue
            prior_sequence = prospective_event_sequences.get(record.event_id)
            if prior_sequence is not None and prior_sequence != record.seq:
                raise SequenceConflict("event_id was reused at another device sequence")
            prospective_seen[record.seq] = identity
            prospective_event_sequences[record.event_id] = record.seq

        new_records = [record for record in batch.records if record.seq not in seen]
        self._records[session_key] = prospective_seen
        self._event_sequences[session_key] = prospective_event_sequences
        cursor = self._advance(session_key)
        return AcceptResult(cursor, not new_records, tuple(new_records))

    def restore(
        self,
        run_id: UUID,
        participant_id: int,
        device_id: str,
        record: EventRecord,
    ) -> None:
        """Rebuild recovered event state without invoking decision logic."""
        session_key = (run_id, participant_id, device_id)
        seen = self._records[session_key]
        event_sequences = self._event_sequences[session_key]
        identity = self._identity(record)
        prior = seen.get(record.seq)
        if prior is not None:
            if prior.event_id != record.event_id:
                raise SequenceConflict(
                    "same device sequence was reused with a different event_id"
                )
            if prior.canonical_content != identity.canonical_content:
                raise SequenceConflict(
                    "same sequence and event_id were reused with different content"
                )
        else:
            prior_sequence = event_sequences.get(record.event_id)
            if prior_sequence is not None and prior_sequence != record.seq:
                raise SequenceConflict("event_id was reused at another device sequence")
            seen[record.seq] = identity
            event_sequences[record.event_id] = record.seq
        self._advance(session_key)

    @staticmethod
    def _identity(record: EventRecord) -> _RecordIdentity:
        canonical_content = json.dumps(
            record.model_dump(mode="json"),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )
        return _RecordIdentity(record.event_id, canonical_content)

    def _advance(self, session_key: tuple[UUID, int, str]) -> int:
        cursor = self._acked[session_key]
        seen = self._records[session_key]
        while cursor + 1 in seen:
            cursor += 1
        self._acked[session_key] = cursor
        return cursor
