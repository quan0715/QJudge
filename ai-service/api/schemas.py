"""Canonical public request and response DTOs."""

from __future__ import annotations

import base64
import binascii
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from domain.models import Artifact, Run, Session, UsageSummary


class CreateSessionRequest(BaseModel):
    context: dict[str, Any] = Field(default_factory=dict)


class RenameSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class SessionResponse(BaseModel):
    session_id: UUID
    title: str
    context: dict[str, Any]

    @classmethod
    def from_domain(cls, session: Session) -> "SessionResponse":
        return cls(
            session_id=session.id,
            title=session.title,
            context=dict(session.context),
        )


class SessionListResponse(BaseModel):
    count: int
    next: str | None = None
    previous: str | None = None
    results: list[SessionResponse]


class StartRunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100_000)
    model_id: str = Field(min_length=1, max_length=50)


class ApproveRunRequest(BaseModel):
    decision: str = Field(min_length=1, max_length=50)


class AnswerRunRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=100_000)


class RunResponse(BaseModel):
    run_id: UUID
    session_id: UUID
    status: str
    kind: str
    model_id: str
    last_sequence: int
    cancel_requested: bool
    error_code: str | None
    error_message: str | None
    pause_payload: dict[str, Any]
    input_tokens: int
    output_tokens: int

    @classmethod
    def from_domain(cls, run: Run) -> "RunResponse":
        return cls(
            run_id=run.id,
            session_id=run.session_id,
            status=run.status.value,
            kind=run.kind.value,
            model_id=run.model_id,
            last_sequence=run.last_sequence,
            cancel_requested=run.cancel_requested,
            error_code=run.error_code,
            error_message=run.error_message,
            pause_payload=dict(run.pause_payload),
            input_tokens=run.usage.input_tokens,
            output_tokens=run.usage.output_tokens,
        )


class RunListResponse(BaseModel):
    count: int
    next: str | None = None
    previous: str | None = None
    results: list[RunResponse]


class ArtifactCreateRequest(BaseModel):
    session_id: UUID
    produced_by_run_id: UUID | None = None
    step: str
    filename: str
    content_type: str
    content_base64: str
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("content_base64")
    @classmethod
    def valid_base64(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("content_base64 must be valid base64") from exc
        return value

    def decoded_content(self) -> bytes:
        return base64.b64decode(self.content_base64, validate=True)


class ArtifactResponse(BaseModel):
    artifact_id: UUID
    session_id: UUID
    produced_by_run_id: UUID | None
    step: str
    filename: str
    content_type: str
    size_bytes: int
    checksum: str
    metadata: dict[str, Any]
    created_at: datetime | None
    updated_at: datetime | None

    @classmethod
    def from_domain(cls, artifact: Artifact) -> "ArtifactResponse":
        return cls(
            artifact_id=artifact.id,
            session_id=artifact.session_id,
            produced_by_run_id=artifact.produced_by_run_id,
            step=artifact.step,
            filename=artifact.filename,
            content_type=artifact.content_type,
            size_bytes=artifact.size_bytes,
            checksum=artifact.checksum,
            metadata=dict(artifact.metadata),
            created_at=artifact.created_at,
            updated_at=artifact.updated_at,
        )


class ArtifactListResponse(BaseModel):
    count: int
    next: str | None = None
    previous: str | None = None
    results: list[ArtifactResponse]


class ModelInfo(BaseModel):
    model_id: str
    display_name: str
    description: str
    is_default: bool


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


class UsageResponse(BaseModel):
    total_input_tokens: int
    total_output_tokens: int
    total_runs: int
    updated_at: datetime | None

    @classmethod
    def from_domain(cls, usage: UsageSummary) -> "UsageResponse":
        return cls(
            total_input_tokens=usage.total_input_tokens,
            total_output_tokens=usage.total_output_tokens,
            total_runs=usage.total_runs,
            updated_at=usage.updated_at,
        )


class LiveResponse(BaseModel):
    status: str = "ok"


class ReadyResponse(BaseModel):
    status: str
    checks: dict[str, str]
