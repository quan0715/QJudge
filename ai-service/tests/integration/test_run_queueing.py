"""PostgreSQL coverage for run idempotency and same-session queueing."""

from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from application.run_service import RunService
from domain.models import Principal, RunStatus, Session
from domain.ports import CredentialLeaseKey, TraceContext
from infrastructure.database.models import MessageRow, RunRow
from infrastructure.database.repositories import SqlAlchemySessionRepository
from infrastructure.database.uow import SqlAlchemyUnitOfWork


class ReadyCredentials:
    async def ensure_ready(
        self, principal: Principal, subject_token: str
    ) -> CredentialLeaseKey:
        return CredentialLeaseKey(f"lease:{principal.subject}")


class RecordingDispatcher:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self.calls: list[tuple[UUID, str | None]] = []

    async def dispatch(
        self,
        run_id: UUID,
        credential_lease_key: str | None,
        trace_context: TraceContext,
    ) -> None:
        # A separate transaction must observe the row before dispatch is allowed.
        async with self._session_factory() as session:
            assert await session.get(RunRow, run_id) is not None
        self.calls.append((run_id, credential_lease_key))


@pytest_asyncio.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
def principal() -> Principal:
    return Principal(issuer="https://issuer.test", subject="teacher-1")


@pytest_asyncio.fixture
async def chat_session(session_factory, principal: Principal) -> Session:
    created = Session(id=uuid4(), owner=principal, title="Chat", context={})
    async with session_factory.begin() as db_session:
        await SqlAlchemySessionRepository(db_session).create(created)
    return created


@pytest.fixture
def run_service(
    session_factory,
) -> tuple[RunService, RecordingDispatcher]:
    dispatcher = RecordingDispatcher(session_factory)
    service = RunService(
        lambda: SqlAlchemyUnitOfWork(session_factory),
        ReadyCredentials(),
        dispatcher,
        trace_provider=TraceContext,
    )
    return service, dispatcher


async def test_start_runs_through_production_sqlalchemy_uow(
    session_factory,
    chat_session: Session,
    principal: Principal,
) -> None:
    dispatcher = RecordingDispatcher(session_factory)
    service = RunService(
        lambda: SqlAlchemyUnitOfWork(session_factory),
        ReadyCredentials(),
        dispatcher,
        trace_provider=TraceContext,
    )

    run = await service.start(
        principal,
        chat_session.id,
        "hello",
        "deepseek-v4-flash",
        "production-uow",
        "token",
    )

    async with session_factory() as db_session:
        messages = (
            await db_session.scalars(
                select(MessageRow)
                .where(MessageRow.session_id == chat_session.id)
                .order_by(MessageRow.ordinal)
            )
        ).all()
    assert [(row.role, row.content) for row in messages] == [
        ("user", "hello"),
        ("assistant", ""),
    ]
    assert dispatcher.calls == [(run.id, "lease:teacher-1")]


async def test_start_commits_one_user_assistant_pair_and_dispatches_after_commit(
    run_service, chat_session: Session, principal: Principal, session_factory
) -> None:
    service, dispatcher = run_service

    run = await service.start(
        principal, chat_session.id, "hello", "deepseek-v4-flash", "message-1", "token"
    )

    async with session_factory() as db_session:
        messages = (
            await db_session.scalars(
                select(MessageRow)
                .where(MessageRow.session_id == chat_session.id)
                .order_by(MessageRow.ordinal)
            )
        ).all()
    assert [(row.ordinal, row.role, row.content) for row in messages] == [
        (1, "user", "hello"),
        (2, "assistant", ""),
    ]
    assert all(row.run_id == run.id for row in messages)
    assert dispatcher.calls == [(run.id, "lease:teacher-1")]


async def test_duplicate_idempotency_key_creates_one_run_and_one_pair(
    run_service, chat_session: Session, principal: Principal, session_factory
) -> None:
    service, dispatcher = run_service
    first = await service.start(
        principal, chat_session.id, "hello", "deepseek-v4-flash", "same", "token"
    )
    second = await service.start(
        principal, chat_session.id, "ignored", "deepseek-v4-flash", "same", "token"
    )

    async with session_factory() as db_session:
        run_count = await db_session.scalar(
            select(func.count()).select_from(RunRow)
        )
        message_count = await db_session.scalar(
            select(func.count()).select_from(MessageRow)
        )
    assert first.id == second.id
    assert run_count == 1
    assert message_count == 2
    assert dispatcher.calls == [(first.id, "lease:teacher-1")]


async def test_concurrent_duplicate_starts_use_database_as_final_arbiter(
    run_service, chat_session: Session, principal: Principal, session_factory
) -> None:
    service, dispatcher = run_service

    first, second = await asyncio.gather(
        service.start(
            principal, chat_session.id, "hello", "deepseek-v4-flash", "race", "token"
        ),
        service.start(
            principal, chat_session.id, "hello", "deepseek-v4-flash", "race", "token"
        ),
    )

    async with session_factory() as db_session:
        run_count = await db_session.scalar(
            select(func.count()).select_from(RunRow)
        )
        message_count = await db_session.scalar(
            select(func.count()).select_from(MessageRow)
        )
    assert first.id == second.id
    assert run_count == 1
    assert message_count == 2
    assert dispatcher.calls == [(first.id, "lease:teacher-1")]


async def test_concurrent_distinct_starts_dispatch_only_first_accepted_run(
    run_service, chat_session: Session, principal: Principal, session_factory
) -> None:
    service, dispatcher = run_service

    first, second = await asyncio.gather(
        service.start(
            principal, chat_session.id, "first", "deepseek-v4-flash", "first", "token"
        ),
        service.start(
            principal, chat_session.id, "second", "deepseek-v4-flash", "second", "token"
        ),
    )

    async with session_factory() as db_session:
        messages = (
            await db_session.scalars(
                select(MessageRow)
                .where(MessageRow.session_id == chat_session.id)
                .order_by(MessageRow.ordinal)
            )
        ).all()
    assert {first.id, second.id} == {row.run_id for row in messages}
    assert [(row.ordinal, row.role) for row in messages] == [
        (1, "user"),
        (2, "assistant"),
        (3, "user"),
        (4, "assistant"),
    ]
    assert dispatcher.calls == [(messages[0].run_id, "lease:teacher-1")]


async def test_running_run_blocks_dispatch_of_next_queued_run(
    run_service, chat_session: Session, principal: Principal, session_factory
) -> None:
    service, dispatcher = run_service
    first = await service.start(
        principal, chat_session.id, "one", "deepseek-v4-flash", "one", "token"
    )
    async with session_factory.begin() as db_session:
        row = await db_session.get(RunRow, first.id)
        assert row is not None
        row.status = RunStatus.RUNNING.value

    second = await service.start(
        principal, chat_session.id, "two", "deepseek-v4-flash", "two", "token"
    )

    assert second.status is RunStatus.QUEUED
    assert dispatcher.calls == [(first.id, "lease:teacher-1")]


async def test_owner_scope_hides_run_without_mcp_dependency(
    run_service, chat_session: Session, principal: Principal
) -> None:
    service, _ = run_service
    run = await service.start(
        principal, chat_session.id, "hello", "deepseek-v4-flash", "owner", "token"
    )

    with pytest.raises(LookupError):
        await service.get(
            Principal(issuer=principal.issuer, subject="another-user"), run.id
        )


async def test_terminal_handoff_selects_oldest_queued_after_commit(
    run_service, chat_session: Session, principal: Principal, session_factory
) -> None:
    service, dispatcher = run_service
    first = await service.start(
        principal, chat_session.id, "one", "deepseek-v4-flash", "one", "token"
    )
    async with session_factory.begin() as db_session:
        row = await db_session.get(RunRow, first.id)
        assert row is not None
        row.status = RunStatus.RUNNING.value
    second = await service.start(
        principal, chat_session.id, "two", "deepseek-v4-flash", "two", "token"
    )
    third = await service.start(
        principal, chat_session.id, "three", "deepseek-v4-flash", "three", "token"
    )
    async with session_factory.begin() as db_session:
        row = await db_session.get(RunRow, first.id)
        assert row is not None
        row.status = RunStatus.COMPLETED.value

    selected = await service.dispatch_next_after_terminal(
        first.id, "lease:teacher-1"
    )

    assert selected is not None and selected.id == second.id
    assert selected.id != third.id
    assert dispatcher.calls == [
        (first.id, "lease:teacher-1"),
        (second.id, "lease:teacher-1"),
    ]
