"""Per-device contiguous sequence acknowledgement."""

from collections import defaultdict
from dataclasses import dataclass
import json
from uuid import UUID

from integrity_service.core.records import AdmittedEventRecord, snapshot_event_record
from integrity_service.core.schemas import EventBatch, EventRecord


class SequenceConflict(ValueError):
    """A device sequence number was reused for a different event."""


@dataclass(frozen=True)
class AcceptResult:
    acked_through_seq: int
    duplicate: bool
    new_records: tuple[AdmittedEventRecord, ...]


@dataclass(frozen=True, slots=True)
class _RecordIdentity:
    event_id: UUID
    canonical_content: str
    record: AdmittedEventRecord


class SessionSequencer:
    def __init__(self) -> None:
        self._acked: dict[tuple[UUID, int, str], int] = defaultdict(int)
        self._records: dict[
            tuple[UUID, int, str], dict[int, _RecordIdentity]
        ] = defaultdict(dict)
        self._event_sequences: dict[
            tuple[UUID, int, str], dict[UUID, int]
        ] = defaultdict(dict)

    def contiguous_cursor(self, run_id: UUID, participant_id: int, device_id: str) -> int:
        return self._acked.get((run_id, participant_id, device_id), 0)

    def accept(self, batch: EventBatch, *, commit: bool = True) -> AcceptResult:
        """Validate atomically; ``commit=False`` previews admission before durable I/O."""
        session_key = (batch.run_id, batch.participant_id, batch.device_id)
        seen = self._records.get(session_key, {})
        event_sequences = self._event_sequences.get(session_key, {})
        prospective_seen = dict(seen)
        prospective_event_sequences = dict(event_sequences)

        # Validate the complete batch before admitting any record. A later conflict must not
        # leave an earlier sequence visible to cursor advancement on a subsequent request.
        new_sequences: list[int] = []
        for source_record in batch.records:
            record = snapshot_event_record(source_record)
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
            new_sequences.append(record.seq)

        new_records = tuple(
            prospective_seen[sequence].record for sequence in new_sequences
        )
        cursor = self._acked.get(session_key, 0)
        while cursor + 1 in prospective_seen:
            cursor += 1
        if commit:
            self._records[session_key] = prospective_seen
            self._event_sequences[session_key] = prospective_event_sequences
            self._acked[session_key] = cursor
        return AcceptResult(cursor, not new_records, new_records)

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
        admitted_record = snapshot_event_record(record)
        identity = self._identity(admitted_record)
        prior = seen.get(admitted_record.seq)
        if prior is not None:
            if prior.event_id != admitted_record.event_id:
                raise SequenceConflict(
                    "same device sequence was reused with a different event_id"
                )
            if prior.canonical_content != identity.canonical_content:
                raise SequenceConflict(
                    "same sequence and event_id were reused with different content"
                )
        else:
            prior_sequence = event_sequences.get(admitted_record.event_id)
            if prior_sequence is not None and prior_sequence != admitted_record.seq:
                raise SequenceConflict("event_id was reused at another device sequence")
            seen[admitted_record.seq] = identity
            event_sequences[admitted_record.event_id] = admitted_record.seq
        self._advance(session_key)

    @staticmethod
    def _identity(record: AdmittedEventRecord) -> _RecordIdentity:
        canonical_content = json.dumps(
            record.to_json(),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )
        return _RecordIdentity(record.event_id, canonical_content, record)

    def _advance(self, session_key: tuple[UUID, int, str]) -> int:
        cursor = self._acked[session_key]
        seen = self._records[session_key]
        while cursor + 1 in seen:
            cursor += 1
        self._acked[session_key] = cursor
        return cursor
