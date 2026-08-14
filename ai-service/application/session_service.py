"""Owner-scoped session use cases."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from typing import Any
from uuid import UUID, uuid4

from domain.models import Principal, Session, SessionDetail
from domain.ports import CheckpointLifecycle, UnitOfWork


class SessionNotFound(LookupError):
    """The requested session does not exist for the authenticated principal."""

    def __init__(self, session_id: UUID) -> None:
        self.session_id = session_id
        super().__init__(f"Session {session_id} was not found")


class SessionService:
    def __init__(
        self,
        uow_factory: Callable[[], UnitOfWork],
        checkpoints: CheckpointLifecycle,
    ) -> None:
        self._uow_factory = uow_factory
        self._checkpoints = checkpoints

    async def create_session(
        self, principal: Principal, context: dict[str, Any]
    ) -> Session:
        session = Session(
            id=uuid4(),
            owner=principal,
            title="New chat",
            context=dict(context),
        )
        async with self._uow_factory() as uow:
            return await uow.sessions.create(session)

    async def list_sessions(self, principal: Principal) -> list[Session]:
        async with self._uow_factory() as uow:
            return await uow.sessions.list_for_owner(principal)

    async def get_session(
        self, principal: Principal, session_id: UUID
    ) -> Session:
        async with self._uow_factory() as uow:
            session = await uow.sessions.get_for_owner(principal, session_id)
            if session is None:
                raise SessionNotFound(session_id)
            return session

    async def get_session_detail(
        self, principal: Principal, session_id: UUID
    ) -> SessionDetail:
        async with self._uow_factory() as uow:
            detail = await uow.sessions.get_detail_for_owner(principal, session_id)
            if detail is None:
                raise SessionNotFound(session_id)
            return detail

    async def rename_session(
        self, principal: Principal, session_id: UUID, title: str
    ) -> Session:
        return await self.update_session(
            principal,
            session_id,
            title=title,
        )

    async def update_session(
        self,
        principal: Principal,
        session_id: UUID,
        *,
        title: str | None = None,
        context: dict[str, Any] | None = None,
        context_mode: str = "merge",
    ) -> Session:
        async with self._uow_factory() as uow:
            session = await uow.sessions.get_for_owner(principal, session_id)
            if session is None:
                raise SessionNotFound(session_id)
            if context is None:
                updated_context = session.context
            elif context_mode == "merge":
                updated_context = {**session.context, **context}
            elif context_mode == "replace":
                updated_context = dict(context)
            else:
                raise ValueError(f"Unsupported context mode: {context_mode}")
            updated = await uow.sessions.update(
                principal,
                replace(
                    session,
                    title=title if title is not None else session.title,
                    context=updated_context,
                ),
            )
            if updated is None:
                raise SessionNotFound(session_id)
            return updated

    async def clear_session(
        self, principal: Principal, session_id: UUID
    ) -> Session:
        async with self._uow_factory() as uow:
            session = await uow.sessions.clear_for_owner(principal, session_id)
            if session is None:
                raise SessionNotFound(session_id)
        await self._checkpoints.delete_session(session_id)
        return session

    async def delete_session(self, principal: Principal, session_id: UUID) -> None:
        async with self._uow_factory() as uow:
            session = await uow.sessions.get_for_owner(principal, session_id)
            if session is None:
                raise SessionNotFound(session_id)
            await uow.sessions.delete(principal, session_id)
        await self._checkpoints.delete_session(session_id)
