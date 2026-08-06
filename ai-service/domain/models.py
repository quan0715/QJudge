"""Immutable, framework-free domain entities."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    AWAITING_USER_ANSWER = "awaiting_user_answer"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunKind(StrEnum):
    CHAT = "chat"
    RESUME = "resume"


@dataclass(frozen=True, slots=True)
class Principal:
    issuer: str
    subject: str


@dataclass(frozen=True, slots=True)
class MessageKey:
    session_id: UUID
    ordinal: int

    @property
    def public_id(self) -> str:
        return f"{self.session_id}:{self.ordinal}"


@dataclass(frozen=True, slots=True)
class Session:
    id: UUID
    owner: Principal
    title: str
    context: dict[str, Any]


@dataclass(frozen=True, slots=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True, slots=True)
class UsageSummary:
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_runs: int = 0
    updated_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class Run:
    id: UUID
    session_id: UUID
    status: RunStatus
    kind: RunKind
    model_id: str
    last_sequence: int = 0
    cancel_requested: bool = False
    error_code: str | None = None
    error_message: str | None = None
    pause_payload: dict[str, Any] = field(default_factory=dict)
    usage: Usage = field(default_factory=Usage)


@dataclass(frozen=True, slots=True)
class Message:
    session_id: UUID
    ordinal: int
    run_id: UUID | None
    role: str
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None

    @property
    def key(self) -> MessageKey:
        return MessageKey(session_id=self.session_id, ordinal=self.ordinal)


@dataclass(frozen=True, slots=True)
class SessionDetail:
    session: Session
    messages: tuple[Message, ...] = ()
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class StreamEvent:
    run_id: UUID
    sequence: int
    event_type: str
    payload: dict[str, Any]
    created_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class Artifact:
    id: UUID
    session_id: UUID
    produced_by_run_id: UUID | None
    step: str
    filename: str
    content_type: str
    size_bytes: int = 0
    checksum: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
