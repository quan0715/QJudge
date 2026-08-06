from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from domain.models import Principal, RunStatus, Session
from domain.ports import CredentialLeaseKey
from infrastructure.database.models import RunEventRow, RunRow, SessionRow
from infrastructure.database.repositories import SqlAlchemySessionRepository
from worker.runtime import SqlAlchemyWorkerRunStore
from worker.scheduler import WorkerScheduler


class Credentials:
    def key_for(self, principal):
        return CredentialLeaseKey(f"lease:{principal.subject}")


class Checkpoints:
    def __init__(self) -> None:
        self.repairs = []

    async def repair_cancelled_run(self, session_id):
        self.repairs.append(session_id)


class Dispatcher:
    def __init__(self) -> None:
        self.calls = []

    async def dispatch(self, run_id, credential_lease_key, trace_context):
        self.calls.append((run_id, credential_lease_key))


@pytest_asyncio.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


async def add_session(session_factory, subject):
    session = Session(
        uuid4(), Principal("https://issuer.test", subject), "Chat", {}
    )
    async with session_factory.begin() as db:
        await SqlAlchemySessionRepository(db).create(session)
    return session


async def add_run(session_factory, session_id, status, *, heartbeat=None):
    run_id = uuid4()
    async with session_factory.begin() as db:
        db.add(
            RunRow(
                run_id=run_id,
                session_id=session_id,
                status=status.value,
                kind="chat",
                model_id="deepseek-v4",
                idempotency_key=str(run_id),
                heartbeat_at=heartbeat,
            )
        )
    return run_id


@pytest.mark.asyncio
async def test_stale_running_run_fails_repairs_and_dispatches_next(
    session_factory,
) -> None:
    session = await add_session(session_factory, "teacher-1")
    stale_id = await add_run(
        session_factory,
        session.id,
        RunStatus.RUNNING,
        heartbeat=datetime.now(UTC) - timedelta(minutes=5),
    )
    queued_id = await add_run(session_factory, session.id, RunStatus.QUEUED)
    dispatcher = Dispatcher()
    checkpoints = Checkpoints()
    scheduler = WorkerScheduler(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        checkpoints,
        Credentials(),
        stale_after_seconds=60,
    )

    recovered = await scheduler.recover_stale_runs()

    async with session_factory() as db:
        stale = await db.get(RunRow, stale_id)
        event_count = await db.scalar(
            select(func.count()).select_from(RunEventRow)
        )
        session_count = await db.scalar(select(func.count()).select_from(SessionRow))
    assert recovered == 1
    assert stale is not None and stale.status == RunStatus.FAILED.value
    assert stale.error_code == "WORKER_STALE"
    assert checkpoints.repairs == [session.id]
    assert dispatcher.calls == [(queued_id, "lease:teacher-1")]
    assert event_count == 1
    assert session_count == 1


@pytest.mark.asyncio
async def test_fresh_heartbeat_is_not_recovered(session_factory) -> None:
    session = await add_session(session_factory, "teacher-1")
    run_id = await add_run(
        session_factory,
        session.id,
        RunStatus.RUNNING,
        heartbeat=datetime.now(UTC),
    )
    dispatcher = Dispatcher()
    scheduler = WorkerScheduler(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Checkpoints(),
        Credentials(),
        stale_after_seconds=60,
    )

    assert await scheduler.recover_stale_runs() == 0
    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
    assert row is not None and row.status == RunStatus.RUNNING.value


@pytest.mark.asyncio
async def test_reconcile_dispatches_only_unblocked_oldest_queued(session_factory) -> None:
    free = await add_session(session_factory, "free")
    blocked = await add_session(session_factory, "blocked")
    first = await add_run(session_factory, free.id, RunStatus.QUEUED)
    await add_run(session_factory, free.id, RunStatus.QUEUED)
    await add_run(
        session_factory,
        blocked.id,
        RunStatus.RUNNING,
        heartbeat=datetime.now(UTC),
    )
    await add_run(session_factory, blocked.id, RunStatus.QUEUED)
    dispatcher = Dispatcher()
    scheduler = WorkerScheduler(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Checkpoints(),
        Credentials(),
        stale_after_seconds=60,
    )

    dispatched = await scheduler.dispatch_unblocked_sessions()

    assert dispatched == 1
    assert dispatcher.calls == [(first, "lease:free")]
