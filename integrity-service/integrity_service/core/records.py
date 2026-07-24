"""Immutable event values admitted by the run-local sequencer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from integrity_service.core.commands import FrozenDict, freeze_json, json_projection
from integrity_service.core.schemas import EventRecord


@dataclass(frozen=True, slots=True)
class AdmittedEventRecord:
    """A transitively immutable snapshot of every canonical EventRecord field."""

    event_id: UUID
    seq: int
    kind: Literal["event", "state_snapshot"]
    event_type: str
    event_schema_version: int
    client_occurred_at_ms: int
    client_recorded_at_ms: int
    monotonic_ms: float
    payload: FrozenDict
    evidence_descriptors: tuple[FrozenDict, ...]

    def __post_init__(self) -> None:
        payload = freeze_json(self.payload, "$.payload")
        evidence = freeze_json(self.evidence_descriptors, "$.evidence_descriptors")
        if not isinstance(payload, FrozenDict):
            raise TypeError("payload must be a JSON object")
        if not isinstance(evidence, tuple) or not all(
            isinstance(item, FrozenDict) for item in evidence
        ):
            raise TypeError("evidence_descriptors must contain only JSON objects")
        object.__setattr__(self, "payload", payload)
        object.__setattr__(self, "evidence_descriptors", evidence)

    def to_json(self) -> dict[str, object]:
        return {
            "event_id": str(self.event_id),
            "seq": self.seq,
            "kind": self.kind,
            "event_type": self.event_type,
            "event_schema_version": self.event_schema_version,
            "client_occurred_at_ms": self.client_occurred_at_ms,
            "client_recorded_at_ms": self.client_recorded_at_ms,
            "monotonic_ms": self.monotonic_ms,
            "payload": json_projection(self.payload),
            "evidence_descriptors": json_projection(self.evidence_descriptors),
        }


def snapshot_event_record(record: EventRecord) -> AdmittedEventRecord:
    """Revalidate and snapshot a possibly caller-mutated Pydantic wire record."""

    if not isinstance(record, EventRecord):
        raise TypeError("record must be an EventRecord")
    validated = EventRecord.model_validate(record.model_dump(mode="python"))
    payload = freeze_json(validated.payload, "$.payload")
    evidence = freeze_json(validated.evidence_descriptors, "$.evidence_descriptors")
    assert isinstance(payload, FrozenDict)
    assert isinstance(evidence, tuple)
    return AdmittedEventRecord(
        event_id=validated.event_id,
        seq=validated.seq,
        kind=validated.kind,
        event_type=validated.event_type,
        event_schema_version=validated.event_schema_version,
        client_occurred_at_ms=validated.client_occurred_at_ms,
        client_recorded_at_ms=validated.client_recorded_at_ms,
        monotonic_ms=validated.monotonic_ms,
        payload=payload,
        evidence_descriptors=evidence,
    )
