"""Pure durable-timeline contract for live and replay decision ordering.

Task 6 must persist one baseline followed by receipt/submission entries with a gap-free,
run-local ``timeline_seq`` before applying any decision. A receipt references its already durable
Task 4 batch; Task 6 must replay that batch through SessionSequencer and pass only its immutable
new-record snapshots here, with delayed event IDs derived from the same frozen policy. Before
applying an input at ``server_ms=T``, this owner advances
all earlier and equal-time derived deadlines in chronological order. Equal derived deadlines
are ordered scheduled end, incident, then connectivity. The durable input follows; a receipt
observes connectivity, ingests admitted records by sequence, then performs incident/connectivity
zero-grace ticks. Thus an already-due transition wins a tie with a manual submission, scheduled
end wins a tie with a timeout, and equal-time receipts follow ``timeline_seq``.

Replay must construct fresh engines from the persisted baseline, apply every entry in sequence,
and advance to the same final authoritative server time. No engine may be called outside this
owner in either live or replay execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias
from uuid import UUID

from integrity_service.core.commands import (
    IntegrityCommand,
    ReceivedEvent,
    SubmissionState,
)
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.incidents import IncidentEngine
from integrity_service.core.records import AdmittedEventRecord
from integrity_service.core.scheduler import DeadlineScheduler


SubmissionSource = Literal["manual", "backend"]


class TimelineOrderError(ValueError):
    """A durable entry did not follow the run-local total order."""


def _validate_server_ms(value: int) -> None:
    if type(value) is not int or value < 0:
        raise ValueError("server_ms must be a non-negative integer")


def _validate_participant_id(value: int) -> None:
    if type(value) is not int or value < 1:
        raise ValueError("participant_id must be a positive integer")


def _validate_canonical_participants(name: str, values: tuple[int, ...]) -> None:
    if type(values) is not tuple:
        raise TypeError(f"{name} must be a tuple")
    for value in values:
        _validate_participant_id(value)
    if tuple(sorted(set(values))) != values:
        raise ValueError(f"{name} must be sorted and unique")


@dataclass(frozen=True, slots=True)
class TimelineBaseline:
    timeline_seq: int
    server_ms: int
    active_participant_ids: tuple[int, ...]
    submitted_participant_ids: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.timeline_seq != 0:
            raise ValueError("baseline timeline_seq must be zero")
        _validate_server_ms(self.server_ms)
        _validate_canonical_participants(
            "active_participant_ids", self.active_participant_ids
        )
        _validate_canonical_participants(
            "submitted_participant_ids", self.submitted_participant_ids
        )

    def to_json(self) -> dict[str, object]:
        return {
            "kind": "baseline",
            "timeline_seq": self.timeline_seq,
            "server_ms": self.server_ms,
            "active_participant_ids": list(self.active_participant_ids),
            "submitted_participant_ids": list(self.submitted_participant_ids),
        }


@dataclass(frozen=True, slots=True)
class BatchReceiptEntry:
    timeline_seq: int
    server_ms: int
    batch_id: UUID
    participant_id: int
    device_id: str

    def __post_init__(self) -> None:
        if type(self.timeline_seq) is not int or self.timeline_seq < 1:
            raise ValueError("timeline_seq must be a positive integer")
        _validate_server_ms(self.server_ms)
        if type(self.batch_id) is not UUID or self.batch_id.int == 0:
            raise ValueError("batch_id must be a non-zero UUID")
        _validate_participant_id(self.participant_id)
        if type(self.device_id) is not str or not self.device_id:
            raise ValueError("device_id must not be empty")

    def to_json(self) -> dict[str, object]:
        return {
            "kind": "batch_receipt",
            "timeline_seq": self.timeline_seq,
            "server_ms": self.server_ms,
            "batch_id": str(self.batch_id),
            "participant_id": self.participant_id,
            "device_id": self.device_id,
        }


@dataclass(frozen=True, slots=True)
class SubmissionEntry:
    timeline_seq: int
    server_ms: int
    participant_id: int
    source: SubmissionSource

    def __post_init__(self) -> None:
        if type(self.timeline_seq) is not int or self.timeline_seq < 1:
            raise ValueError("timeline_seq must be a positive integer")
        _validate_server_ms(self.server_ms)
        _validate_participant_id(self.participant_id)
        if self.source not in ("manual", "backend"):
            raise ValueError("source must be manual or backend")

    def to_json(self) -> dict[str, object]:
        return {
            "kind": "submission",
            "timeline_seq": self.timeline_seq,
            "server_ms": self.server_ms,
            "participant_id": self.participant_id,
            "source": self.source,
        }


TimelineEntry: TypeAlias = BatchReceiptEntry | SubmissionEntry


class DecisionTimeline:
    """Serialize all pure-core engine calls behind the durable timeline contract."""

    def __init__(
        self,
        *,
        baseline: TimelineBaseline,
        incidents: IncidentEngine,
        connectivity: ConnectivityMonitor,
        scheduler: DeadlineScheduler,
        submissions: SubmissionState,
    ) -> None:
        if any(
            owner is not submissions
            for owner in (
                incidents._submissions,
                connectivity._submissions,
                scheduler._submissions,
            )
        ):
            raise ValueError("timeline engines must share one SubmissionState")
        self._incidents = incidents
        self._connectivity = connectivity
        self._scheduler = scheduler
        self._submissions = submissions
        self._active_participant_ids = set(baseline.active_participant_ids)
        self._last_timeline_seq = baseline.timeline_seq
        self._clock_server_ms = baseline.server_ms
        self._scheduled_end_advanced = False
        for participant_id in baseline.submitted_participant_ids:
            submissions.mark_submitted(participant_id)

    def apply(
        self,
        entry: TimelineEntry,
        *,
        records: tuple[AdmittedEventRecord, ...] = (),
        delayed_event_ids: frozenset[UUID] = frozenset(),
    ) -> tuple[IntegrityCommand, ...]:
        self._validate_entry(entry, records, delayed_event_ids)
        commands = list(self._advance(entry.server_ms))
        if isinstance(entry, SubmissionEntry):
            self._submissions.mark_submitted(entry.participant_id)
        else:
            commands.extend(
                self._connectivity.observe(
                    participant_id=entry.participant_id,
                    device_id=entry.device_id,
                    server_ms=entry.server_ms,
                )
            )
            for record in records:
                commands.extend(
                    self._incidents.ingest(
                        ReceivedEvent(
                            participant_id=entry.participant_id,
                            device_id=entry.device_id,
                            record=record,
                            received_at_server_ms=entry.server_ms,
                            delayed_delivery=record.event_id in delayed_event_ids,
                        )
                    ).commands
                )
            commands.extend(self._incidents.tick(entry.server_ms).commands)
            commands.extend(self._connectivity.tick(entry.server_ms))
        self._last_timeline_seq = entry.timeline_seq
        return tuple(commands)

    def advance_to(self, server_ms: int) -> tuple[IntegrityCommand, ...]:
        _validate_server_ms(server_ms)
        if server_ms < self._clock_server_ms:
            raise TimelineOrderError("server_ms cannot move backwards")
        return self._advance(server_ms)

    def _validate_entry(
        self,
        entry: TimelineEntry,
        records: tuple[AdmittedEventRecord, ...],
        delayed_event_ids: frozenset[UUID],
    ) -> None:
        if not isinstance(entry, (BatchReceiptEntry, SubmissionEntry)):
            raise TypeError("entry must be a durable timeline entry")
        if entry.timeline_seq != self._last_timeline_seq + 1:
            raise TimelineOrderError("timeline_seq must be gap-free and increasing")
        if entry.server_ms < self._clock_server_ms:
            raise TimelineOrderError("server_ms cannot move backwards")
        if type(records) is not tuple or not all(
            isinstance(record, AdmittedEventRecord) for record in records
        ):
            raise TypeError("records must be admitted immutable event snapshots")
        if type(delayed_event_ids) is not frozenset or not all(
            type(event_id) is UUID for event_id in delayed_event_ids
        ):
            raise TypeError("delayed_event_ids must be a frozenset of UUID values")
        if isinstance(entry, BatchReceiptEntry):
            if not records:
                raise ValueError("batch receipt must include admitted records")
            sequences = tuple(record.seq for record in records)
            if sequences != tuple(sorted(set(sequences))):
                raise ValueError("receipt records must be sorted by unique sequence")
            if not delayed_event_ids.issubset(
                record.event_id for record in records
            ):
                raise ValueError("delayed_event_ids must identify receipt records")
        elif records or delayed_event_ids:
            raise ValueError("submission entry cannot include records")

    def _advance(self, target_server_ms: int) -> tuple[IntegrityCommand, ...]:
        commands: list[IntegrityCommand] = []
        while True:
            due_times = [
                deadline
                for deadline in (
                    None
                    if self._scheduled_end_advanced
                    else self._scheduler.scheduled_end_ms,
                    self._incidents.next_deadline_server_ms(),
                    self._connectivity.next_transition_server_ms(),
                )
                if deadline is not None
            ]
            if not due_times:
                break
            due_server_ms = min(due_times)
            if due_server_ms > target_server_ms:
                break
            if (
                not self._scheduled_end_advanced
                and self._scheduler.scheduled_end_ms == due_server_ms
            ):
                commands.extend(
                    self._scheduler.tick(
                        due_server_ms, self._active_participant_ids
                    )
                )
                self._scheduled_end_advanced = True
            commands.extend(self._incidents.tick(due_server_ms).commands)
            commands.extend(self._connectivity.tick(due_server_ms))
        self._clock_server_ms = target_server_ms
        return tuple(commands)
