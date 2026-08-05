"""Integration coverage for owner-scoped AI persistence."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from application.session_service import SessionNotFound, SessionService
from application.usage_service import UsageService
from domain.models import Principal, Usage, UsageSummary
from infrastructure.database.models import MessageRow, RunRow, SessionRow
from infrastructure.database.uow import SqlAlchemyUnitOfWork


@pytest.fixture
def principal_a() -> Principal:
    return Principal(issuer="https://issuer.example", subject="subject-a")


@pytest.fixture
def principal_b() -> Principal:
    return Principal(issuer="https://issuer.example", subject="subject-b")


@pytest_asyncio.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
def uow_factory(session_factory) -> Callable[[], SqlAlchemyUnitOfWork]:
    return lambda: SqlAlchemyUnitOfWork(session_factory)


@pytest.fixture
def session_service(uow_factory) -> SessionService:
    return SessionService(uow_factory)


@pytest.fixture
def usage_service(uow_factory) -> UsageService:
    return UsageService(uow_factory)


async def test_get_session_never_returns_another_subject(
    session_service: SessionService,
    principal_a: Principal,
    principal_b: Principal,
) -> None:
    created = await session_service.create_session(principal_a, {})

    with pytest.raises(SessionNotFound):
        await session_service.get_session(principal_b, created.id)

    same_subject_from_another_issuer = Principal(
        issuer="https://another-issuer.example",
        subject=principal_a.subject,
    )
    with pytest.raises(SessionNotFound):
        await session_service.get_session(same_subject_from_another_issuer, created.id)


async def test_session_list_and_mutations_are_scoped_to_owner(
    session_service: SessionService,
    principal_a: Principal,
    principal_b: Principal,
) -> None:
    owned = await session_service.create_session(principal_a, {"course_id": "one"})
    hidden = await session_service.create_session(principal_b, {"course_id": "two"})

    assert await session_service.list_sessions(principal_a) == [owned]

    with pytest.raises(SessionNotFound):
        await session_service.rename_session(principal_a, hidden.id, "stolen")
    with pytest.raises(SessionNotFound):
        await session_service.clear_session(principal_a, hidden.id)
    with pytest.raises(SessionNotFound):
        await session_service.delete_session(principal_a, hidden.id)

    assert (await session_service.get_session(principal_b, hidden.id)).title == "New chat"

    another_issuer = Principal(
        issuer="https://another-issuer.example",
        subject=principal_b.subject,
    )
    with pytest.raises(SessionNotFound):
        await session_service.rename_session(another_issuer, hidden.id, "stolen")
    with pytest.raises(SessionNotFound):
        await session_service.clear_session(another_issuer, hidden.id)
    with pytest.raises(SessionNotFound):
        await session_service.delete_session(another_issuer, hidden.id)

    assert (await session_service.get_session(principal_b, hidden.id)).title == "New chat"


async def test_clear_session_deletes_only_owned_messages_and_resets_ordinal(
    session_service: SessionService,
    session_factory,
    principal_a: Principal,
    principal_b: Principal,
) -> None:
    owned = await session_service.create_session(principal_a, {})
    hidden = await session_service.create_session(principal_b, {})

    async with session_factory.begin() as db_session:
        owned_row = await db_session.get(SessionRow, owned.id)
        hidden_row = await db_session.get(SessionRow, hidden.id)
        assert owned_row is not None
        assert hidden_row is not None
        owned_row.next_message_ordinal = 3
        hidden_row.next_message_ordinal = 2
        db_session.add_all(
            [
                MessageRow(
                    session_id=owned.id,
                    ordinal=1,
                    role="user",
                    content="owned",
                ),
                MessageRow(
                    session_id=hidden.id,
                    ordinal=1,
                    role="user",
                    content="hidden",
                ),
            ]
        )

    assert await session_service.clear_session(principal_a, owned.id) == owned

    async with session_factory() as db_session:
        messages = (
            await db_session.scalars(
                select(MessageRow).order_by(MessageRow.session_id)
            )
        ).all()
        owned_row = await db_session.get(SessionRow, owned.id)
        hidden_row = await db_session.get(SessionRow, hidden.id)

    assert [(row.session_id, row.content) for row in messages] == [
        (hidden.id, "hidden")
    ]
    assert owned_row is not None and owned_row.next_message_ordinal == 1
    assert hidden_row is not None and hidden_row.next_message_ordinal == 2


async def test_usage_is_aggregated_from_owned_runs(
    session_service: SessionService,
    usage_service: UsageService,
    session_factory,
    principal_a: Principal,
    principal_b: Principal,
) -> None:
    owned = await session_service.create_session(principal_a, {})
    hidden = await session_service.create_session(principal_b, {})
    first_update = datetime(2026, 8, 4, 10, tzinfo=UTC)
    latest_owned_update = first_update + timedelta(minutes=5)
    hidden_update = first_update + timedelta(days=1)
    async with session_factory.begin() as db_session:
        db_session.add_all(
            [
                RunRow(
                    run_id=uuid4(),
                    session_id=owned.id,
                    status="completed",
                    kind="chat",
                    model_id="test-model",
                    idempotency_key="owned-run",
                    input_tokens=10,
                    output_tokens=4,
                    updated_at=first_update,
                ),
                RunRow(
                    run_id=uuid4(),
                    session_id=owned.id,
                    status="completed",
                    kind="chat",
                    model_id="test-model",
                    idempotency_key="owned-run-2",
                    input_tokens=3,
                    output_tokens=8,
                    updated_at=latest_owned_update,
                ),
                RunRow(
                    run_id=uuid4(),
                    session_id=hidden.id,
                    status="completed",
                    kind="chat",
                    model_id="test-model",
                    idempotency_key="hidden-run",
                    input_tokens=99,
                    output_tokens=99,
                    updated_at=hidden_update,
                ),
            ]
        )

    usage = await usage_service.get_usage(principal_a)
    summary = await usage_service.get_usage_summary(principal_a)

    assert usage == Usage(input_tokens=13, output_tokens=12)
    assert summary == UsageSummary(
        total_input_tokens=13,
        total_output_tokens=12,
        total_runs=2,
        updated_at=latest_owned_update,
    )


async def test_usage_summary_has_zero_totals_when_owner_has_no_runs(
    session_service: SessionService,
    usage_service: UsageService,
    principal_a: Principal,
) -> None:
    await session_service.create_session(principal_a, {})

    assert await usage_service.get_usage_summary(principal_a) == UsageSummary(
        total_input_tokens=0,
        total_output_tokens=0,
        total_runs=0,
        updated_at=None,
    )


async def test_unit_of_work_rolls_back_failed_transaction(
    uow_factory,
    session_service: SessionService,
    principal_a: Principal,
) -> None:
    session = await session_service.create_session(principal_a, {})

    with pytest.raises(RuntimeError, match="force rollback"):
        async with uow_factory() as uow:
            await uow.sessions.update(
                principal_a, replace(session, title="Must roll back")
            )
            raise RuntimeError("force rollback")

    assert (await session_service.get_session(principal_a, session.id)).title == "New chat"
