from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from domain.models import Principal, RunStatus, Session
from domain.ports import CredentialLeaseKey, TraceContext
from infrastructure.database.models import MessageRow, RunEventRow, RunRow, SessionRow
from infrastructure.database.repositories import SqlAlchemySessionRepository
from worker.runtime import SqlAlchemyWorkerRunStore, WorkerRuntime
from worker.scheduler import WorkerScheduler


class Credentials:
    def key_for(self, principal):
        return CredentialLeaseKey(f"lease:{principal.subject}")

    async def worker_token(self, lease_key, *, retry_exchange_once):
        return "mcp-token"


class Checkpoints:
    def __init__(self) -> None:
        self.repairs = []

    async def repair_cancelled_run(self, session_id):
        self.repairs.append(session_id)


class FailingCheckpoints(Checkpoints):
    async def repair_cancelled_run(self, session_id):
        self.repairs.append(session_id)
        raise RuntimeError("checkpoint unavailable")


class Agent:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def execute(self, command):
        self.started.set()
        await self.release.wait()
        yield {"type": "agent_message_delta", "content": "late"}
        yield {"type": "run_completed"}


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
                model_id="deepseek-v4-flash",
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
async def test_stale_repair_failure_stays_blocked_and_retryable(
    session_factory,
) -> None:
    session = await add_session(session_factory, "teacher-repair")
    stale_id = await add_run(
        session_factory,
        session.id,
        RunStatus.RUNNING,
        heartbeat=datetime.now(UTC) - timedelta(minutes=5),
    )
    await add_run(session_factory, session.id, RunStatus.QUEUED)
    dispatcher = Dispatcher()
    store = SqlAlchemyWorkerRunStore(session_factory, dispatcher)
    scheduler = WorkerScheduler(
        store,
        FailingCheckpoints(),
        Credentials(),
        stale_after_seconds=60,
    )

    assert await scheduler.recover_stale_runs() == 0
    assert await scheduler.dispatch_unblocked_sessions() == 0

    async with session_factory() as db:
        row = await db.get(RunRow, stale_id)
    assert row is not None
    assert row.status == RunStatus.RUNNING.value
    assert row.repair_pending is True
    assert dispatcher.calls == []


@pytest.mark.asyncio
async def test_recovered_worker_epoch_rejects_late_events_and_heartbeat(
    session_factory,
) -> None:
    session = await add_session(session_factory, "teacher-fenced")
    run_id = await add_run(session_factory, session.id, RunStatus.QUEUED)
    successor_id = await add_run(session_factory, session.id, RunStatus.QUEUED)
    async with session_factory.begin() as db:
        db.add_all(
            [
                MessageRow(
                    session_id=session.id,
                    ordinal=1,
                    run_id=run_id,
                    role="user",
                    content="hello",
                ),
                MessageRow(
                    session_id=session.id,
                    ordinal=2,
                    run_id=run_id,
                    role="assistant",
                    content="",
                ),
            ]
        )
    dispatcher = Dispatcher()
    store = SqlAlchemyWorkerRunStore(session_factory, dispatcher)
    agent = Agent()
    runtime = WorkerRuntime(
        store,
        Credentials(),
        agent,
        Checkpoints(),
        heartbeat_seconds=60,
    )
    execution = asyncio.create_task(
        runtime.execute(run_id, "lease:teacher-fenced", TraceContext())
    )
    await agent.started.wait()
    async with session_factory.begin() as db:
        row = await db.get(RunRow, run_id)
        assert row is not None
        old_epoch = row.execution_epoch
        row.heartbeat_at = datetime.now(UTC) - timedelta(minutes=5)

    scheduler = WorkerScheduler(
        store,
        Checkpoints(),
        Credentials(),
        stale_after_seconds=60,
    )
    assert await scheduler.recover_stale_runs() == 1
    assert await store.heartbeat(run_id, old_epoch) is False
    assert (
        await store.append_event(
            run_id,
            old_epoch,
            {"type": "agent_message_delta", "content": "stale"},
        )
        is False
    )
    assert (
        await store.append_event(
            run_id,
            old_epoch,
            {
                "type": "run_failed",
                "error_code": "AGENT_ERROR",
                "message": "late failure",
            },
        )
        is False
    )
    agent.release.set()
    await execution

    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
        events = (
            await db.scalars(
                select(RunEventRow).where(RunEventRow.run_id == run_id)
            )
        ).all()
    assert row is not None and row.status == RunStatus.FAILED.value
    assert [event.event_type for event in events] == ["run_failed"]
    assert dispatcher.calls == [(successor_id, "lease:teacher-fenced")]


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
