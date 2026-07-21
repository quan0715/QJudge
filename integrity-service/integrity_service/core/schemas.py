"""Pydantic contracts shared by integrity event producers and consumers."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class EventRecord(BaseModel):
    event_id: UUID
    seq: int = Field(ge=1)
    kind: Literal["event", "state_snapshot"]
    event_type: str = Field(min_length=1, max_length=64)
    event_schema_version: int = Field(ge=1)
    client_occurred_at_ms: int = Field(ge=0)
    client_recorded_at_ms: int = Field(ge=0)
    monotonic_ms: float = Field(ge=0)
    payload: dict = Field(default_factory=dict)
    evidence_descriptors: list[dict] = Field(default_factory=list)


class EventBatch(BaseModel):
    schema_version: Literal[1]
    batch_id: UUID
    run_id: UUID
    participant_id: int = Field(ge=1)
    device_id: str = Field(min_length=1, max_length=128)
    registry_version: str = Field(min_length=1, max_length=64)
    first_seq: int = Field(ge=1)
    last_seq: int = Field(ge=1)
    records: list[EventRecord] = Field(min_length=1, max_length=200)
    client_build: str = Field(max_length=64)

    @model_validator(mode="after")
    def validate_range(self) -> "EventBatch":
        expected = list(range(self.first_seq, self.last_seq + 1))
        actual = [record.seq for record in self.records]
        if actual != expected:
            raise ValueError("records must exactly cover first_seq..last_seq")
        return self


class EvidenceRetainCommand(BaseModel):
    command_id: UUID
    incident_id: UUID
    event_id: str
    sources: list[Literal["screen_share", "webcam"]]
    start_at_ms: int
    end_at_ms: int


class BatchAck(BaseModel):
    acked_through_seq: int = Field(ge=0)
    pending_commands: list[EvidenceRetainCommand] = Field(default_factory=list)
    release_evidence_before_ms: int = Field(ge=0)
