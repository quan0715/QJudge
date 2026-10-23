"""Worker store queries used by the batch grading finalizer."""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from domain.models import Principal, RunStatus, Session
from infrastructure.database.models import MessageRow, RunRow
from infrastructure.database.repositories import SqlAlchemySessionRepository
from worker.runtime import SqlAlchemyWorkerRunStore

BATCH_CONTEXT = {"task_manifest": {"task_type": "grading.batch", "context": {"contest_id": "c1"}}}


class Dispatcher:
    async def dispatch(self, run_id, credential_lease_key, trace_context):
        return None


@pytest_asyncio.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


async def add_session(session_factory) -> Session:
    session = Session(uuid4(), Principal("https://issuer.test", "teacher"), "Batch", BATCH_CONTEXT)
    async with session_factory.begin() as db:
        await SqlAlchemySessionRepository(db).create(session)
    return session


async def add_run(session_factory, session_id, status, *, prompt="hi", ordinal=1):
    run_id = uuid4()
    async with session_factory.begin() as db:
        db.add(
            RunRow(
                run_id=run_id,
                session_id=session_id,
                status=status.value,
                kind="chat",
                model_id="deepseek-flash",
                idempotency_key=str(run_id),
                error_code="WORKER_STALE" if status is RunStatus.FAILED else None,
                error_message="stale" if status is RunStatus.FAILED else None,
            )
        )
        await db.flush()
        db.add(MessageRow(session_id=session_id, ordinal=ordinal, run_id=run_id, role="user", content=prompt))
        db.add(
            MessageRow(
                session_id=session_id,
                ordinal=ordinal + 1,
                run_id=run_id,
                role="assistant",
                content="",
                metadata_={"run_id": str(run_id), "run_status": status.value},
            )
        )
    return run_id


@pytest.mark.asyncio
async def test_load_terminal_run_returns_user_message_and_context(session_factory) -> None:
    session = await add_session(session_factory)
    run_id = await add_run(
        session_factory, session.id, RunStatus.FAILED, prompt="batch_question_id: q3\n請批改"
    )
    store = SqlAlchemyWorkerRunStore(session_factory, Dispatcher())

    info = await store.load_terminal_run(run_id)

    assert info is not None
    assert info.session_id == session.id
    assert info.status == "failed"
    assert info.error_code == "WORKER_STALE"
    assert info.error_message == "stale"
    assert info.user_message == "batch_question_id: q3\n請批改"
    assert info.session_context == BATCH_CONTEXT


@pytest.mark.asyncio
async def test_cancel_queued_in_session_cancels_only_queued_runs(session_factory) -> None:
    session = await add_session(session_factory)
    running = await add_run(session_factory, session.id, RunStatus.RUNNING, ordinal=1)
    queued = await add_run(session_factory, session.id, RunStatus.QUEUED, ordinal=3)
    store = SqlAlchemyWorkerRunStore(session_factory, Dispatcher())

    cancelled = await store.cancel_queued_in_session(session.id)

    async with session_factory() as db:
        running_row = await db.get(RunRow, running)
        queued_row = await db.get(RunRow, queued)
        assistant = await db.get(MessageRow, (session.id, 4))
    assert cancelled == 1
    assert running_row.status == RunStatus.RUNNING.value
    assert queued_row.status == RunStatus.CANCELLED.value
    assert assistant.metadata_["run_status"] == RunStatus.CANCELLED.value


@pytest.mark.asyncio
async def test_terminal_commit_recovers_after_worker_loss_and_serializes_replays(session_factory):
    import asyncio
    from domain.ports import CredentialLeaseKey, TraceContext
    from worker.runtime import TerminalHookRunStore
    from worker.scheduler import WorkerScheduler
    from infrastructure.database.repositories import SqlAlchemyRunRepository

    session = await add_session(session_factory)
    run_id = await add_run(session_factory, session.id, RunStatus.RUNNING)
    queued = await add_run(session_factory, session.id, RunStatus.QUEUED, ordinal=3)
    dispatched = []
    class RecordingDispatcher:
        async def dispatch(self, run_id, *args):
            dispatched.append(run_id)
    store = SqlAlchemyWorkerRunStore(session_factory, RecordingDispatcher())
    assert await store.append_event(run_id, 0, {"type": "run_completed"})
    # Simulate worker loss immediately after terminal commit, before any hook.
    async with session_factory() as db:
        row = await db.get(RunRow, run_id)
        assert row.status == "completed" and row.finalization_pending
        assert await SqlAlchemyRunRepository(db).has_blocking_run(session.id)
    assert await store.claim_for_execution(queued) is None
    assert await store.unblocked_queued_runs() == []

    entered, release = asyncio.Event(), asyncio.Event()
    calls = []
    async def hook(run_id, key):
        calls.append(run_id)
        if len(calls) == 1:
            raise OSError("storage unavailable")
        entered.set()
        await release.wait()
    class Credentials:
        def key_for(self, owner):
            return CredentialLeaseKey("lease:teacher")
    recovered_store = SqlAlchemyWorkerRunStore(session_factory, RecordingDispatcher())
    wrapped = TerminalHookRunStore(recovered_store, hook)
    scheduler = WorkerScheduler(wrapped, None, Credentials(), stale_after_seconds=60)
    await scheduler.recover_pending_finalizations()
    assert len(await recovered_store.pending_finalizations()) == 1
    assert dispatched == []
    retry = asyncio.create_task(scheduler.recover_pending_finalizations())
    await asyncio.wait_for(entered.wait(), timeout=5)
    await wrapped.dispatch_next_after_terminal(run_id, "lease:teacher", TraceContext())
    assert calls == [run_id, run_id]
    assert dispatched == []
    # Losing the worker during the hook also releases its lock and keeps pending.
    retry.cancel()
    with pytest.raises(asyncio.CancelledError):
        await retry
    assert len(await recovered_store.pending_finalizations()) == 1
    release.set()
    await scheduler.recover_pending_finalizations()
    assert await recovered_store.pending_finalizations() == []
    assert dispatched == [queued]
    await scheduler.recover_pending_finalizations()
    assert calls == [run_id, run_id, run_id]
    async with session_factory.begin() as db:
        await SqlAlchemyRunRepository(db).append_event(run_id, {"type": "run_completed"})
    assert await recovered_store.pending_finalizations() == []
    assert await recovered_store.claim_for_execution(queued) is not None
