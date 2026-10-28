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
async def test_followup_inherits_latest_prior_teacher_scope_only(session_factory):
    session = await add_session(session_factory)
    first = 'batch_units: [{"id":"q1","question_ids":["q1"]}]'
    latest = 'batch_units: [{"id":"q2","question_ids":["q2"]}]'
    await add_run(session_factory, session.id, RunStatus.FAILED, prompt=first, ordinal=1)
    await add_run(session_factory, session.id, RunStatus.FAILED, prompt=latest, ordinal=3)
    followup = await add_run(session_factory, session.id, RunStatus.RUNNING, prompt="繼續", ordinal=5)
    await add_run(session_factory, session.id, RunStatus.QUEUED, prompt=first, ordinal=7)
    store = SqlAlchemyWorkerRunStore(session_factory, Dispatcher())
    info = await store.load_terminal_run(followup)
    assert info.user_message == "繼續"
    assert info.batch_request == latest


@pytest.mark.asyncio
async def test_plain_session_has_no_inherited_batch_request(session_factory):
    session = await add_session(session_factory)
    run = await add_run(session_factory, session.id, RunStatus.RUNNING, prompt="繼續")
    info = await SqlAlchemyWorkerRunStore(session_factory, Dispatcher()).load_terminal_run(run)
    assert info.batch_request == ""
