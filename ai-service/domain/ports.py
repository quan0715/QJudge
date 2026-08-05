"""I/O contracts consumed by the application layer.

These protocols deliberately use only domain types and standard-library values so
the domain remains independent of SQLAlchemy, Redis, Celery, storage SDKs and
web frameworks.
"""

from __future__ import annotations

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


class SessionRepository(Protocol):
    async def create(self, session: Session) -> Session: ...

    async def list_for_owner(self, principal: Principal) -> list[Session]: ...

    async def get_for_owner(self, principal: Principal, session_id: UUID) -> Session | None: ...

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

    async def update(self, run: Run) -> Run: ...

    async def append_event(self, run_id: UUID, event: dict[str, Any]) -> StreamEvent: ...

    async def list_events(self, run_id: UUID, after: int = 0) -> list[StreamEvent]: ...


class MessageRepository(Protocol):
    async def append(self, message: Message) -> Message: ...

    async def list_for_session(self, session_id: UUID) -> list[Message]: ...

    async def clear_for_session(self, session_id: UUID) -> None: ...


class ArtifactRepository(Protocol):
    async def create(self, artifact: Artifact) -> Artifact: ...

    async def get_for_owner(self, principal: Principal, artifact_id: UUID) -> Artifact | None: ...


class Queue(Protocol):
    async def enqueue(self, run_id: UUID) -> None: ...


class Clock(Protocol):
    def now(self) -> datetime: ...


class UsageReader(Protocol):
    async def get_for_owner(self, principal: Principal) -> Usage: ...

    async def get_summary_for_owner(
        self, principal: Principal
    ) -> UsageSummary: ...


class UnitOfWork(Protocol):
    sessions: SessionRepository
    usage: UsageReader

    async def __aenter__(self) -> "UnitOfWork": ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...
