"""Application service behavior independent of SQLAlchemy."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from application.session_service import SessionNotFound, SessionService
from domain.models import Principal, Session


class FakeSessionRepository:
    def __init__(self) -> None:
        self.sessions: dict[UUID, Session] = {}
        self.cleared: list[UUID] = []
        self.fail_next_update = False

    async def create(self, session: Session) -> Session:
        self.sessions[session.id] = session
        return session

    async def list_for_owner(self, principal: Principal) -> list[Session]:
        return [item for item in self.sessions.values() if item.owner == principal]

    async def get_for_owner(
        self, principal: Principal, session_id: UUID
    ) -> Session | None:
        session = self.sessions.get(session_id)
        return session if session is not None and session.owner == principal else None

    async def update(
        self, principal: Principal, session: Session
    ) -> Session | None:
        if self.fail_next_update:
            self.fail_next_update = False
            return None
        existing = await self.get_for_owner(principal, session.id)
        if existing is None:
            return None
        self.sessions[session.id] = session
        return session

    async def clear_for_owner(
        self, principal: Principal, session_id: UUID
    ) -> Session | None:
        session = await self.get_for_owner(principal, session_id)
        if session is not None:
            self.cleared.append(session_id)
        return session

    async def delete(self, principal: Principal, session_id: UUID) -> bool:
        session = await self.get_for_owner(principal, session_id)
        if session is None:
            return False
        del self.sessions[session_id]
        return True


class FakeUnitOfWork:
    def __init__(self, sessions: FakeSessionRepository) -> None:
        self.sessions = sessions

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class FakeCheckpointLifecycle:
    def __init__(self) -> None:
        self.deleted_session_ids: list[UUID] = []

    async def delete_session(self, session_id: UUID) -> None:
        self.deleted_session_ids.append(session_id)


async def test_create_and_rename_session_preserve_owner_and_context() -> None:
    principal = Principal(issuer="issuer", subject="subject")
    repository = FakeSessionRepository()
    service = SessionService(
        lambda: FakeUnitOfWork(repository), FakeCheckpointLifecycle()
    )

    created = await service.create_session(principal, {"course_id": "course-1"})
    renamed = await service.rename_session(principal, created.id, "Reviewed chat")

    assert created.title == "New chat"
    assert renamed == Session(
        id=created.id,
        owner=principal,
        title="Reviewed chat",
        context={"course_id": "course-1"},
    )


async def test_update_session_merges_or_replaces_context_explicitly() -> None:
    principal = Principal(issuer="issuer", subject="subject")
    repository = FakeSessionRepository()
    existing = Session(
        id=uuid4(),
        owner=principal,
        title="Chat",
        context={"course_id": "course-1", "locale": "zh-TW"},
    )
    repository.sessions[existing.id] = existing
    service = SessionService(
        lambda: FakeUnitOfWork(repository), FakeCheckpointLifecycle()
    )

    merged = await service.update_session(
        principal,
        existing.id,
        context={"task_manifest": {"schema_version": 1}},
        context_mode="merge",
    )
    replaced = await service.update_session(
        principal,
        existing.id,
        context={"task_manifest": {"schema_version": 2}},
        context_mode="replace",
    )

    assert merged.context == {
        "course_id": "course-1",
        "locale": "zh-TW",
        "task_manifest": {"schema_version": 1},
    }
    assert replaced.context == {"task_manifest": {"schema_version": 2}}


async def test_missing_or_foreign_session_uses_not_found_semantics() -> None:
    principal = Principal(issuer="issuer", subject="subject")
    other = Principal(issuer="issuer", subject="other")
    repository = FakeSessionRepository()
    foreign = Session(id=uuid4(), owner=other, title="Private", context={})
    repository.sessions[foreign.id] = foreign
    checkpoints = FakeCheckpointLifecycle()
    service = SessionService(lambda: FakeUnitOfWork(repository), checkpoints)

    with pytest.raises(SessionNotFound):
        await service.get_session(principal, foreign.id)
    with pytest.raises(SessionNotFound):
        await service.delete_session(principal, uuid4())

    assert checkpoints.deleted_session_ids == []


async def test_rename_reports_not_found_when_owned_update_changes_no_row() -> None:
    principal = Principal(issuer="issuer", subject="subject")
    repository = FakeSessionRepository()
    existing = Session(id=uuid4(), owner=principal, title="Chat", context={})
    repository.sessions[existing.id] = existing
    repository.fail_next_update = True
    service = SessionService(
        lambda: FakeUnitOfWork(repository), FakeCheckpointLifecycle()
    )

    with pytest.raises(SessionNotFound):
        await service.rename_session(principal, existing.id, "Never persisted")

    assert repository.sessions[existing.id] == existing


async def test_clear_session_deletes_checkpoint_after_owned_mutation() -> None:
    principal = Principal(issuer="issuer", subject="subject")
    repository = FakeSessionRepository()
    existing = Session(id=uuid4(), owner=principal, title="Chat", context={})
    repository.sessions[existing.id] = existing
    checkpoints = FakeCheckpointLifecycle()
    service = SessionService(lambda: FakeUnitOfWork(repository), checkpoints)

    assert await service.clear_session(principal, existing.id) == existing
    assert repository.cleared == [existing.id]
    assert checkpoints.deleted_session_ids == [existing.id]


async def test_delete_session_deletes_checkpoint_after_owned_mutation() -> None:
    principal = Principal(issuer="issuer", subject="subject")
    repository = FakeSessionRepository()
    existing = Session(id=uuid4(), owner=principal, title="Chat", context={})
    repository.sessions[existing.id] = existing
    checkpoints = FakeCheckpointLifecycle()
    service = SessionService(lambda: FakeUnitOfWork(repository), checkpoints)

    await service.delete_session(principal, existing.id)

    assert existing.id not in repository.sessions
    assert checkpoints.deleted_session_ids == [existing.id]
