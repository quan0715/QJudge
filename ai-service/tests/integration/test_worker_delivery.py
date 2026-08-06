from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from domain.models import Principal, RunStatus, Session
from domain.ports import (
    CredentialLease,
    CredentialLeaseKey,
    ExchangedToken,
    McpAuthFailed,
    TraceContext,
)
from infrastructure.database.models import RunEventRow, RunRow
from infrastructure.database.repositories import SqlAlchemySessionRepository
from infrastructure.mcp.credential_lease import RedisCredentialLeaseStore
from worker.runtime import (
    SqlAlchemyWorkerRunStore,
    WorkerCredentialResolver,
    WorkerRuntime,
)
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
        self.calls = []

    async def execute(self, command):
        self.calls.append(command.run_id)
        await asyncio.sleep(0.01)
        yield {"type": "usage_report", "input_tokens": 9, "output_tokens": 4}
        yield {"type": "run_completed"}


class DelayedAgent(Agent):
    def __init__(self) -> None:
        super().__init__()
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def execute(self, command):
        self.calls.append(command.run_id)
        self.started.set()
        await self.release.wait()
        yield {"type": "agent_message_delta", "content": "late"}
        yield {"type": "run_completed"}


class Dispatcher:
    def __init__(self) -> None:
        self.calls = []

    async def dispatch(self, run_id, credential_lease_key, trace_context):
        self.calls.append((run_id, credential_lease_key))


class RejectExpiredPreflight:
    def __init__(self) -> None:
        self.tokens = []

    async def check(self, token):
        self.tokens.append(token)
        if token == "expired-token":
            raise McpAuthFailed("expired")


class ReplacementExchange:
    def __init__(self) -> None:
        self.calls = 0

    async def exchange(self, subject_token):
        self.calls += 1
        return ExchangedToken(
            access_token="replacement-token",
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
            scopes=frozenset({"mcp"}),
        )


class BlockingReplacementExchange(ReplacementExchange):
    def __init__(self) -> None:
        super().__init__()
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def exchange(self, subject_token):
        self.calls += 1
        self.started.set()
        await self.release.wait()
        return ExchangedToken(
            access_token="replacement-token",
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
            scopes=frozenset({"mcp"}),
        )


@pytest_asyncio.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


async def seed_run(session_factory, *, status=RunStatus.QUEUED, cancel=False):
    owner = Principal("https://issuer.test", "teacher-1")
    chat = Session(uuid4(), owner, "Chat", {})
    run_id = uuid4()
    async with session_factory.begin() as db:
        await SqlAlchemySessionRepository(db).create(chat)
        db.add(
            RunRow(
                run_id=run_id,
                session_id=chat.id,
                status=status.value,
                kind="chat",
                model_id="deepseek-v4",
                idempotency_key=str(run_id),
                cancel_requested=cancel,
                heartbeat_at=datetime.now(UTC),
            )
        )
        await db.flush()
        from infrastructure.database.models import MessageRow

        db.add_all(
            [
                MessageRow(
                    session_id=chat.id,
                    ordinal=1,
                    run_id=run_id,
                    role="user",
                    content="hello",
                ),
                MessageRow(
                    session_id=chat.id,
                    ordinal=2,
                    run_id=run_id,
                    role="assistant",
                    content="",
                ),
            ]
        )
    return chat, run_id


@pytest.mark.asyncio
async def test_duplicate_delivery_executes_and_accounts_once(session_factory) -> None:
    _, run_id = await seed_run(session_factory)
    dispatcher = Dispatcher()
    store = SqlAlchemyWorkerRunStore(session_factory, dispatcher)
    agent = Agent()
    runtime = WorkerRuntime(store, Credentials(), agent, Checkpoints())

    await asyncio.gather(
        runtime.execute(run_id, "lease:teacher-1", TraceContext()),
        runtime.execute(run_id, "lease:teacher-1", TraceContext()),
    )

    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
        event_count = await db.scalar(
            select(func.count()).select_from(RunEventRow)
        )
    assert agent.calls == [run_id]
    assert row is not None and row.status == RunStatus.COMPLETED.value
    assert row.execution_epoch == 1
    assert row.repair_pending is False
    assert (row.input_tokens, row.output_tokens) == (9, 4)
    assert event_count == 2


@pytest.mark.asyncio
async def test_paused_cancel_repairs_without_agent(session_factory) -> None:
    chat, run_id = await seed_run(
        session_factory,
        status=RunStatus.AWAITING_USER_ANSWER,
        cancel=True,
    )
    dispatcher = Dispatcher()
    checkpoints = Checkpoints()
    agent = Agent()
    runtime = WorkerRuntime(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Credentials(),
        agent,
        checkpoints,
    )

    await runtime.execute(run_id, None, TraceContext())

    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
    assert row is not None and row.status == RunStatus.CANCELLED.value
    assert checkpoints.repairs == [chat.id]
    assert agent.calls == []


@pytest.mark.asyncio
async def test_duplicate_paused_cancel_delivery_repairs_once(session_factory) -> None:
    chat, run_id = await seed_run(
        session_factory,
        status=RunStatus.AWAITING_USER_ANSWER,
        cancel=True,
    )
    dispatcher = Dispatcher()
    checkpoints = Checkpoints()
    runtime = WorkerRuntime(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Credentials(),
        Agent(),
        checkpoints,
    )

    await asyncio.gather(
        runtime.execute(run_id, None, TraceContext()),
        runtime.execute(run_id, None, TraceContext()),
    )

    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
        events = (
            await db.scalars(
                select(RunEventRow).where(RunEventRow.run_id == run_id)
            )
        ).all()
    assert row is not None and row.status == RunStatus.CANCELLED.value
    assert checkpoints.repairs == [chat.id]
    assert [event.event_type for event in events] == ["run_cancelled"]


@pytest.mark.asyncio
async def test_cancel_repair_failure_keeps_session_blocked(session_factory) -> None:
    chat, run_id = await seed_run(session_factory)
    successor_id = uuid4()
    async with session_factory.begin() as db:
        db.add(
            RunRow(
                run_id=successor_id,
                session_id=chat.id,
                status=RunStatus.QUEUED.value,
                kind="chat",
                model_id="deepseek-v4",
                idempotency_key=str(successor_id),
            )
        )
    dispatcher = Dispatcher()
    agent = DelayedAgent()
    runtime = WorkerRuntime(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Credentials(),
        agent,
        FailingCheckpoints(),
    )

    execution = asyncio.create_task(
        runtime.execute(run_id, "lease:teacher-1", TraceContext())
    )
    await agent.started.wait()
    async with session_factory.begin() as db:
        row = await db.get(RunRow, run_id)
        assert row is not None
        row.cancel_requested = True
    agent.release.set()
    await execution

    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
    assert row is not None
    assert row.status == RunStatus.RUNNING.value
    assert row.repair_pending is True
    assert dispatcher.calls == []
    assert (
        await WorkerScheduler(
            SqlAlchemyWorkerRunStore(session_factory, dispatcher),
            FailingCheckpoints(),
            Credentials(),
            stale_after_seconds=60,
        ).dispatch_unblocked_sessions()
        == 0
    )

    async with session_factory.begin() as db:
        row = await db.get(RunRow, run_id)
        assert row is not None
        row.heartbeat_at = datetime.now(UTC) - timedelta(minutes=5)
    recovered = await WorkerScheduler(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Checkpoints(),
        Credentials(),
        stale_after_seconds=60,
    ).recover_stale_runs()

    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
    assert recovered == 1
    assert row is not None and row.status == RunStatus.CANCELLED.value
    assert row.repair_pending is False
    assert dispatcher.calls == [(successor_id, "lease:teacher-1")]


@pytest.mark.asyncio
async def test_running_cancel_stops_cooperatively_and_repairs_checkpoint(
    session_factory,
) -> None:
    chat, run_id = await seed_run(session_factory)
    dispatcher = Dispatcher()
    checkpoints = Checkpoints()
    agent = DelayedAgent()
    runtime = WorkerRuntime(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Credentials(),
        agent,
        checkpoints,
        heartbeat_seconds=0.005,
    )

    execution = asyncio.create_task(
        runtime.execute(run_id, "lease:teacher-1", TraceContext())
    )
    await agent.started.wait()
    async with session_factory.begin() as db:
        row = await db.get(RunRow, run_id)
        assert row is not None and row.status == RunStatus.RUNNING.value
        row.cancel_requested = True
    agent.release.set()
    await execution

    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
        events = (
            await db.scalars(
                select(RunEventRow).where(RunEventRow.run_id == run_id)
            )
        ).all()
    assert row is not None and row.status == RunStatus.CANCELLED.value
    assert checkpoints.repairs == [chat.id]
    assert [event.event_type for event in events] == ["run_cancelled"]


@pytest.mark.asyncio
async def test_terminal_run_dispatches_oldest_queued_successor(session_factory) -> None:
    chat, first_id = await seed_run(session_factory)
    second_id = uuid4()
    async with session_factory.begin() as db:
        db.add(
            RunRow(
                run_id=second_id,
                session_id=chat.id,
                status=RunStatus.QUEUED.value,
                kind="chat",
                model_id="deepseek-v4",
                idempotency_key=str(second_id),
            )
        )
    dispatcher = Dispatcher()
    runtime = WorkerRuntime(
        SqlAlchemyWorkerRunStore(session_factory, dispatcher),
        Credentials(),
        Agent(),
        Checkpoints(),
    )

    await runtime.execute(first_id, "lease:teacher-1", TraceContext())

    assert dispatcher.calls == [(second_id, "lease:teacher-1")]


@pytest.mark.asyncio
async def test_worker_replaces_rejected_lease_in_real_redis() -> None:
    redis_url = os.environ.get("AI_TEST_REDIS_URL", "").strip()
    if not redis_url:
        pytest.fail(
            "AI_TEST_REDIS_URL is required for Worker credential integration"
        )
    redis = Redis.from_url(redis_url, decode_responses=False)
    await redis.flushdb()
    try:
        store = RedisCredentialLeaseStore(
            redis,
            secret="worker-test-secret-that-is-long-enough",
            mcp_server_id="qjudge",
        )
        principal = Principal("https://issuer.test", "teacher-redis")
        key = store.key_for(principal)
        await store.put(
            key,
            CredentialLease(
                subject_token="subject-token",
                mcp_token="expired-token",
                expires_at=datetime.now(UTC) + timedelta(minutes=5),
                scopes=frozenset({"mcp"}),
            ),
        )
        preflight = RejectExpiredPreflight()
        exchange = ReplacementExchange()
        resolver = WorkerCredentialResolver(store, exchange, preflight)

        token = await resolver.worker_token(
            key.value,
            retry_exchange_once=True,
        )

        persisted = await store.get(key)
        assert token == "replacement-token"
        assert persisted is not None
        assert persisted.mcp_token == "replacement-token"
        assert exchange.calls == 1
        assert preflight.tokens == ["expired-token", "replacement-token"]
    finally:
        await redis.flushdb()
        await redis.aclose()


@pytest.mark.asyncio
async def test_concurrent_rejected_lease_refresh_is_single_flight() -> None:
    redis_url = os.environ.get("AI_TEST_REDIS_URL", "").strip()
    if not redis_url:
        pytest.fail(
            "AI_TEST_REDIS_URL is required for Worker credential integration"
        )
    redis = Redis.from_url(redis_url, decode_responses=False)
    await redis.flushdb()
    try:
        store = RedisCredentialLeaseStore(
            redis,
            secret="worker-test-secret-that-is-long-enough",
            mcp_server_id="qjudge",
        )
        principal = Principal("https://issuer.test", "teacher-race")
        key = store.key_for(principal)
        await store.put(
            key,
            CredentialLease(
                subject_token="subject-token",
                mcp_token="expired-token",
                expires_at=datetime.now(UTC) + timedelta(minutes=5),
                scopes=frozenset({"mcp"}),
            ),
        )
        preflight = RejectExpiredPreflight()
        exchange = BlockingReplacementExchange()
        resolver = WorkerCredentialResolver(store, exchange, preflight)

        first = asyncio.create_task(
            resolver.worker_token(key.value, retry_exchange_once=True)
        )
        await exchange.started.wait()
        second = asyncio.create_task(
            resolver.worker_token(key.value, retry_exchange_once=True)
        )
        await asyncio.sleep(0.01)
        exchange.release.set()
        tokens = await asyncio.gather(first, second)

        assert tokens == ["replacement-token", "replacement-token"]
        assert exchange.calls == 1
    finally:
        await redis.flushdb()
        await redis.aclose()
