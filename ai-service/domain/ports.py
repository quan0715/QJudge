"""I/O contracts consumed by the application layer.

These protocols deliberately use only domain types and standard-library values so
the domain remains independent of SQLAlchemy, Redis, Celery, storage SDKs and
web frameworks.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from types import TracebackType
from typing import Any, Protocol
from uuid import UUID

from .models import (
    Artifact,
    Message,
    Principal,
    Run,
    Session,
    StreamEvent,
    Usage,
    UsageSummary,
)


@dataclass(frozen=True, slots=True)
class TraceContext:
    """Small, queue-safe request trace propagated into the worker."""

    request_id: str | None = None
    traceparent: str | None = None


@dataclass(frozen=True, slots=True)
class CredentialLeaseKey:
    value: str


@dataclass(frozen=True, slots=True)
class CredentialLease:
    subject_token: str
    mcp_token: str
    expires_at: datetime
    scopes: frozenset[str]


@dataclass(frozen=True, slots=True)
class ExchangedToken:
    access_token: str
    expires_at: datetime
    scopes: frozenset[str]


class McpReadinessError(RuntimeError):
    """Stable application error raised before an agent operation is accepted."""

    code = "MCP_UNAVAILABLE"
    retryable = True


class McpAuthFailed(McpReadinessError):
    code = "MCP_AUTH_FAILED"


class McpUnavailable(McpReadinessError):
    code = "MCP_UNAVAILABLE"


class McpProtocolError(McpReadinessError):
    code = "MCP_PROTOCOL_ERROR"
    retryable = False


class McpToolDiscoveryFailed(McpReadinessError):
    code = "MCP_TOOL_DISCOVERY_FAILED"
    retryable = False


class CredentialLeaseStore(Protocol):
    def key_for(self, principal: Principal) -> CredentialLeaseKey: ...

    async def get(self, key: CredentialLeaseKey) -> CredentialLease | None: ...

    async def put(self, key: CredentialLeaseKey, lease: CredentialLease) -> None: ...

    async def delete(self, key: CredentialLeaseKey) -> None: ...


class McpTokenExchange(Protocol):
    async def exchange(self, subject_token: str) -> ExchangedToken: ...


class McpReadinessPreflight(Protocol):
    async def check(self, mcp_token: str) -> None: ...


class SessionRepository(Protocol):
    async def create(self, session: Session) -> Session: ...

    async def list_for_owner(self, principal: Principal) -> list[Session]: ...

    async def get_for_owner(self, principal: Principal, session_id: UUID) -> Session | None: ...

    async def get_for_update(
        self, principal: Principal, session_id: UUID
    ) -> Session | None: ...

    async def update(
        self, principal: Principal, session: Session
    ) -> Session | None: ...

    async def clear_for_owner(
        self, principal: Principal, session_id: UUID
    ) -> Session | None: ...

    async def delete(self, principal: Principal, session_id: UUID) -> None: ...


class RunRepository(Protocol):
    async def create(self, run: Run) -> Run: ...

    async def get(self, run_id: UUID) -> Run | None: ...

    async def get_for_owner(
        self, principal: Principal, run_id: UUID
    ) -> Run | None: ...

    async def get_for_update(
        self, principal: Principal, run_id: UUID
    ) -> Run | None: ...

    async def get_by_idempotency_key(
        self, session_id: UUID, idempotency_key: str
    ) -> Run | None: ...

    async def create_queued(
        self, session_id: UUID, model_id: str, idempotency_key: str
    ) -> Run: ...

    async def has_blocking_run(
        self, session_id: UUID, excluding: UUID
    ) -> bool: ...

    async def oldest_queued(
        self, session_id: UUID, excluding: UUID | None = None
    ) -> Run | None: ...

    async def oldest_queued_after_terminal(self, run_id: UUID) -> Run | None: ...

    async def update(self, run: Run) -> Run: ...

    async def append_event(self, run_id: UUID, event: dict[str, Any]) -> StreamEvent: ...

    async def list_events(self, run_id: UUID, after: int = 0) -> list[StreamEvent]: ...

    async def list_events_for_owner(
        self, principal: Principal, run_id: UUID, after: int = 0
    ) -> list[StreamEvent]: ...


class MessageRepository(Protocol):
    async def append(self, message: Message) -> Message: ...

    async def list_for_session(self, session_id: UUID) -> list[Message]: ...

    async def clear_for_session(self, session_id: UUID) -> None: ...

    async def append_pair(
        self, session: Session, run_id: UUID, prompt: str
    ) -> tuple[Message, Message]: ...


class ArtifactRepository(Protocol):
    async def create(self, artifact: Artifact) -> Artifact: ...

    async def get_for_owner(self, principal: Principal, artifact_id: UUID) -> Artifact | None: ...


class Queue(Protocol):
    async def enqueue(self, run_id: UUID) -> None: ...


class RunDispatcher(Protocol):
    async def dispatch(
        self,
        run_id: UUID,
        credential_lease_key: str | None,
        trace_context: TraceContext,
    ) -> None: ...


class CheckpointLifecycle(Protocol):
    """Narrow session-facing lifecycle for non-authoritative Agent state."""

    async def delete_session(self, session_id: UUID) -> None: ...


class Clock(Protocol):
    def now(self) -> datetime: ...


class UsageReader(Protocol):
    async def get_for_owner(self, principal: Principal) -> Usage: ...

    async def get_summary_for_owner(
        self, principal: Principal
    ) -> UsageSummary: ...


class UnitOfWork(Protocol):
    sessions: SessionRepository
    runs: RunRepository
    messages: MessageRepository
    usage: UsageReader

    async def __aenter__(self) -> "UnitOfWork": ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...
