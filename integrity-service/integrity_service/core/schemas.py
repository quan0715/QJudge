"""Pydantic contracts shared by integrity event producers and consumers."""

import math
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WireModel(BaseModel):
    """Stable wire model that rejects fields not covered by the contract."""

    model_config = ConfigDict(extra="forbid")


def _validate_json_value(value: object, path: str = "$") -> object:
    value_type = type(value)
    if value is None or value_type in (str, bool, int):
        return value
    if value_type is float:
        if not math.isfinite(value):
            raise ValueError(f"{path} must contain only finite JSON numbers")
        return value
    if value_type is list:
        for index, item in enumerate(value):
            _validate_json_value(item, f"{path}[{index}]")
        return value
    if value_type is dict:
        for key, item in value.items():
            if type(key) is not str:
                raise ValueError(f"{path} must contain only string JSON object keys")
            _validate_json_value(item, f"{path}.{key}")
        return value
    raise ValueError(f"{path} must contain only JSON-compatible values")


class EventRecord(WireModel):
    event_id: UUID
    seq: int = Field(strict=True, ge=1)
    kind: Literal["event", "state_snapshot"]
    event_type: str = Field(strict=True, min_length=1, max_length=64)
    event_schema_version: int = Field(strict=True, ge=1)
    client_occurred_at_ms: int = Field(strict=True, ge=0)
    client_recorded_at_ms: int = Field(strict=True, ge=0)
    monotonic_ms: float = Field(strict=True, ge=0)
    payload: dict[str, object] = Field(default_factory=dict, strict=True)
    evidence_descriptors: list[dict[str, object]] = Field(default_factory=list, strict=True)

    @field_validator("payload", "evidence_descriptors", mode="before")
    @classmethod
    def validate_json_values(cls, value: object) -> object:
        return _validate_json_value(value)


class EventBatch(WireModel):
    schema_version: Literal[1]
    batch_id: UUID
    run_id: UUID
    participant_id: int = Field(strict=True, ge=1)
    device_id: str = Field(strict=True, min_length=1, max_length=128)
    registry_version: str = Field(strict=True, min_length=1, max_length=64)
    first_seq: int = Field(strict=True, ge=1)
    last_seq: int = Field(strict=True, ge=1)
    records: list[EventRecord] = Field(strict=True, min_length=1, max_length=200)
    client_build: str = Field(strict=True, max_length=64)

    @field_validator("schema_version", mode="before")
    @classmethod
    def validate_schema_version_type(cls, value: object) -> object:
        if type(value) is not int:
            raise ValueError("schema_version must be an integer")
        return value

    @model_validator(mode="after")
    def validate_range(self) -> "EventBatch":
        if self.last_seq - self.first_seq + 1 != len(self.records):
            raise ValueError("records must exactly cover first_seq..last_seq")
        for offset, record in enumerate(self.records):
            if record.seq != self.first_seq + offset:
                raise ValueError("records must exactly cover first_seq..last_seq")
        return self


class EvidenceRetainCommand(WireModel):
    command_id: UUID
    incident_id: UUID
    event_id: str = Field(strict=True)
    sources: list[Literal["screen_share", "webcam"]] = Field(strict=True)
    start_at_ms: int = Field(strict=True)
    end_at_ms: int = Field(strict=True)


class BatchAck(WireModel):
    acked_through_seq: int = Field(strict=True, ge=0)
    pending_commands: list[EvidenceRetainCommand] = Field(default_factory=list, strict=True)
    release_evidence_before_ms: int = Field(strict=True, ge=0)
