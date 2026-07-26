"""Pure durable-timeline contract for live and replay decision ordering.

Task 6 must persist one baseline followed by receipt entries with a gap-free,
run-local ``timeline_seq`` before applying any decision. A receipt references its already durable
Task 4 batch; Task 6 must replay that batch through SessionSequencer and pass only its immutable
new-record snapshots here, with delayed event IDs derived from the same frozen policy. Before
applying an input at ``server_ms=T``, this owner advances
all earlier and equal-time derived deadlines in chronological order. Equal derived deadlines
are ordered scheduled end, incident, then connectivity. The durable receipt follows; it
observes connectivity, ingests admitted records by sequence, then performs incident/connectivity
zero-grace ticks. Thus scheduled end wins a tie with a timeout, and equal-time receipts follow
``timeline_seq``.

Replay must construct fresh engines from the persisted baseline, apply every entry in sequence,
and advance to the same final authoritative server time. No engine may be called outside this
owner in either live or replay execution.

Unknown browser signal IDs and invalid browser payloads remain durable raw-journal input. A
receipt plan classifies them into immutable bounded warning dispositions before any engine state
changes; only known-valid admitted records receive semantic handling, and an empty exact-retry
receipt remains a connectivity observation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias
from uuid import UUID

from jsonschema import ValidationError

from integrity_service.core.commands import (
    IntegrityCommand,
    ReceivedEvent,
)
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.incidents import IncidentEngine
from integrity_service.core.records import AdmittedEventRecord
from integrity_service.core.registry import UnknownSignal
from integrity_service.core.scheduler import DeadlineScheduler


SkippedRecordCode = Literal["unknown_signal", "invalid_payload"]


class TimelineOrderError(ValueError):
    """A durable entry did not follow the run-local total order."""


@dataclass(frozen=True, slots=True)
class SkippedReceiptRecord:
    """An immutable browser record deliberately excluded from semantic decisions."""

    record: AdmittedEventRecord
    code: SkippedRecordCode

    def __post_init__(self) -> None:
        if not isinstance(self.record, AdmittedEventRecord):
            raise TypeError(
                "skipped record must be an admitted immutable event snapshot"
            )
        if self.code not in ("unknown_signal", "invalid_payload"):
            raise ValueError("skipped record code is not supported")


@dataclass(frozen=True, slots=True)
class ReceiptPlan:
    """Pure receipt disposition Task 6 can use to journal warnings without blocking ACK."""

    accepted_records: tuple[AdmittedEventRecord, ...]
    skipped_records: tuple[SkippedReceiptRecord, ...]

    def __post_init__(self) -> None:
        if type(self.accepted_records) is not tuple or not all(
            isinstance(record, AdmittedEventRecord) for record in self.accepted_records
        ):
            raise TypeError("accepted receipt records must be immutable snapshots")
        if type(self.skipped_records) is not tuple or not all(
            isinstance(record, SkippedReceiptRecord) for record in self.skipped_records
        ):
            raise TypeError("skipped receipt records must be immutable dispositions")


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

    def __post_init__(self) -> None:
        if self.timeline_seq != 0:
            raise ValueError("baseline timeline_seq must be zero")
        _validate_server_ms(self.server_ms)
        _validate_canonical_participants(
            "active_participant_ids", self.active_participant_ids
        )

    def to_json(self) -> dict[str, object]:
        return {
            "kind": "baseline",
            "timeline_seq": self.timeline_seq,
            "server_ms": self.server_ms,
            "active_participant_ids": list(self.active_participant_ids),
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


TimelineEntry: TypeAlias = BatchReceiptEntry


class DecisionTimeline:
    """Serialize all pure-core engine calls behind the durable timeline contract."""

    def __init__(
        self,
        *,
        baseline: TimelineBaseline,
        incidents: IncidentEngine,
        connectivity: ConnectivityMonitor,
        scheduler: DeadlineScheduler,
    ) -> None:
        self._incidents = incidents
        self._connectivity = connectivity
        self._scheduler = scheduler
        self._active_participant_ids = set(baseline.active_participant_ids)
        self._last_timeline_seq = baseline.timeline_seq
        self._clock_server_ms = baseline.server_ms
        self._scheduled_end_advanced = False

    def apply(
        self,
        entry: TimelineEntry,
        *,
        records: tuple[AdmittedEventRecord, ...] = (),
        delayed_event_ids: frozenset[UUID] = frozenset(),
    ) -> tuple[IntegrityCommand, ...]:
        self._validate_entry(entry, records, delayed_event_ids)
        receipt_plan = self.plan_receipt(records=records)
        commands = list(self._advance(entry.server_ms))
        was_active = entry.participant_id in self._active_participant_ids
        self._active_participant_ids.add(entry.participant_id)
        if self._scheduled_end_advanced and not was_active:
            commands.extend(
                self._scheduler.tick(entry.server_ms, {entry.participant_id})
            )
        commands.extend(
            self._connectivity.observe(
                participant_id=entry.participant_id,
                device_id=entry.device_id,
                server_ms=entry.server_ms,
            )
        )
        for record in receipt_plan.accepted_records:
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
            if record.event_type == "exam_submit_initiated":
                self._active_participant_ids.discard(entry.participant_id)
                self._connectivity.stop_participant(entry.participant_id)
        commands.extend(self._incidents.tick(entry.server_ms).commands)
        commands.extend(self._connectivity.tick(entry.server_ms))
        self._last_timeline_seq = entry.timeline_seq
        return tuple(commands)

    def plan_receipt(self, *, records: tuple[AdmittedEventRecord, ...]) -> ReceiptPlan:
        """Classify immutable browser records before any timeline engine is mutated.

        Unknown signal IDs and metadata that fails the current registry contract are normal
        untrusted browser input. They are retained by Task 6's raw journal and represented here
        for a bounded warning, but do not receive semantic engine handling or block an ACK.
        """
        if type(records) is not tuple or not all(
            isinstance(record, AdmittedEventRecord) for record in records
        ):
            raise TypeError("records must be admitted immutable event snapshots")
        accepted: list[AdmittedEventRecord] = []
        skipped: list[SkippedReceiptRecord] = []
        for record in records:
            if record.kind == "health_snapshot":
                continue
            try:
                self._incidents._registry.resolve(record.event_type)
                self._incidents._registry.validate_payload(
                    record.event_type, record.payload
                )
            except UnknownSignal:
                skipped.append(SkippedReceiptRecord(record, "unknown_signal"))
            except ValidationError:
                skipped.append(SkippedReceiptRecord(record, "invalid_payload"))
            else:
                accepted.append(record)
        return ReceiptPlan(tuple(accepted), tuple(skipped))

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
        if not isinstance(entry, BatchReceiptEntry):
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
        sequences = tuple(record.seq for record in records)
        if sequences != tuple(sorted(set(sequences))):
            raise ValueError("receipt records must be sorted by unique sequence")
        if not delayed_event_ids.issubset(record.event_id for record in records):
            raise ValueError("delayed_event_ids must identify receipt records")

    def _advance(self, target_server_ms: int) -> tuple[IntegrityCommand, ...]:
        commands: list[IntegrityCommand] = []
        while True:
            due_times = [
                deadline
                for deadline in (
                    (
                        None
                        if self._scheduled_end_advanced
                        else self._scheduler.scheduled_end_ms
                    ),
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
                    self._scheduler.tick(due_server_ms, self._active_participant_ids)
                )
                self._scheduled_end_advanced = True
            commands.extend(self._incidents.tick(due_server_ms).commands)
            commands.extend(self._connectivity.tick(due_server_ms))
        self._clock_server_ms = target_server_ms
        return tuple(commands)
