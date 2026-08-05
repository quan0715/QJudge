"""I/O contracts consumed by the application layer.

These protocols deliberately use only domain types and standard-library values so
the domain remains independent of SQLAlchemy, Redis, Celery, storage SDKs and
web frameworks.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from .models import Artifact, Message, Principal, Run, Session, StreamEvent, Usage


class SessionRepository(Protocol):
    async def create(self, session: Session) -> Session: ...

    async def list_for_owner(self, principal: Principal) -> list[Session]: ...

    async def get_for_owner(self, principal: Principal, session_id: UUID) -> Session | None: ...

    async def update(self, session: Session) -> Session: ...

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
