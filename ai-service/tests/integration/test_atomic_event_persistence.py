"""PostgreSQL integration tests for atomic event persistence."""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from domain.errors import InvalidRunTransition
from domain.models import RunStatus
from infrastructure.database.models import MessageRow, RunRow, SessionRow
from infrastructure.database.repositories import SqlAlchemyRunRepository


@pytest_asyncio.fixture
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def seeded_run(session_factory):
    session_id = uuid4()
    run_id = uuid4()
    async with session_factory.begin() as db_session:
        db_session.add(
            SessionRow(
                session_id=session_id,
                owner_issuer="https://issuer.example",
                owner_subject="subject-a",
                title="Atomic run",
            )
        )
        await db_session.flush()
        db_session.add(
            RunRow(
                run_id=run_id,
                session_id=session_id,
                status=RunStatus.RUNNING,
                kind="chat",
                model_id="test-model",
                idempotency_key="atomic-run",
            )
        )
        await db_session.flush()
        db_session.add(
            MessageRow(
                session_id=session_id,
                ordinal=1,
                run_id=run_id,
                role="assistant",
                content="",
            )
        )
    return run_id, session_id


async def test_projection_failure_rolls_back_event_and_sequence(
    session_factory, seeded_run, monkeypatch
) -> None:
    run_id, _ = seeded_run

    def fail_projection(*args, **kwargs) -> None:
        raise RuntimeError("projection failed")

    monkeypatch.setattr(
        "infrastructure.database.repositories.reduce_run_event",
        fail_projection,
    )
    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        with pytest.raises(RuntimeError, match="projection failed"):
            async with db_session.begin():
                await repository.append_event(
                    run_id,
                    {"type": "agent_message_delta", "content": "lost"},
                )

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        refreshed = await repository.get(run_id)
        events = await repository.list_events(run_id, after=0)

    assert refreshed is not None
    assert refreshed.last_sequence == 0
    assert events == []


async def test_append_event_does_not_commit_callers_transaction(
    session_factory, seeded_run
) -> None:
    run_id, _ = seeded_run
    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        await db_session.begin()
        await repository.append_event(
            run_id,
            {"type": "agent_message_delta", "content": "rollback me"},
        )
        await db_session.rollback()

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        refreshed = await repository.get(run_id)
        events = await repository.list_events(run_id)

    assert refreshed is not None
    assert refreshed.last_sequence == 0
    assert events == []


async def test_event_run_usage_and_assistant_projection_commit_atomically(
    session_factory, seeded_run
) -> None:
    run_id, session_id = seeded_run
    async with session_factory.begin() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        usage_event = await repository.append_event(
            run_id,
            {"type": "usage_report", "input_tokens": 13, "output_tokens": 8},
        )
        replacement_usage_event = await repository.append_event(
            run_id,
            {"type": "usage_report", "input_tokens": 5, "output_tokens": 3},
        )
        completed_event = await repository.append_event(
            run_id,
            {
                "type": "run_completed",
                "next_turn_options": [{"label": "Again", "message": "Again"}],
            },
        )

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        run = await repository.get(run_id)
        events = await repository.list_events(run_id)
        assistant = await db_session.get(MessageRow, (session_id, 1))

    assert run is not None
    assert run.status is RunStatus.COMPLETED
    assert run.last_sequence == 3
    assert run.usage.input_tokens == 5
    assert run.usage.output_tokens == 3
    assert [
        usage_event.sequence,
        replacement_usage_event.sequence,
        completed_event.sequence,
    ] == [1, 2, 3]
    assert [event.sequence for event in events] == [1, 2, 3]
    assert assistant is not None
    assert assistant.metadata_["usage"] == {"input_tokens": 5, "output_tokens": 3}
    assert assistant.metadata_["next_turn_options"] == [
        {"label": "Again", "message": "Again"}
    ]
    assert assistant.metadata_["run_status"] == "completed"
    assert assistant.metadata_["last_event_seq"] == 3
    assert "cost_cents" not in assistant.metadata_["usage"]
    assert "credits" not in assistant.metadata_["usage"]


async def test_concurrent_events_allocate_distinct_sequences(
    session_factory, seeded_run
) -> None:
    run_id, session_id = seeded_run

    async def append(content: str) -> int:
        async with session_factory.begin() as db_session:
            event = await SqlAlchemyRunRepository(db_session).append_event(
                run_id,
                {"type": "agent_message_delta", "content": content},
            )
            return event.sequence

    allocated = await asyncio.gather(append("A"), append("B"))

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        events = await repository.list_events(run_id)
        assistant = await db_session.get(MessageRow, (session_id, 1))

    assert sorted(allocated) == [1, 2]
    assert [event.sequence for event in events] == [1, 2]
    assert assistant is not None
    assert assistant.content in {"AB", "BA"}


async def test_cancelled_run_ignores_late_event_without_allocating_sequence(
    session_factory, seeded_run
) -> None:
    run_id, _ = seeded_run
    async with session_factory.begin() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        cancelled = await repository.append_event(run_id, {"type": "run_cancelled"})
        late = await repository.append_event(
            run_id, {"type": "agent_message_delta", "content": "late"}
        )

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        run = await repository.get(run_id)
        events = await repository.list_events(run_id)

    assert cancelled.sequence == 1
    assert late.sequence == 1
    assert run is not None and run.last_sequence == 1
    assert [event.event_type for event in events] == ["run_cancelled"]


async def test_failed_run_ignores_late_nonterminal_event_without_allocating_sequence(
    session_factory, seeded_run
) -> None:
    run_id, _ = seeded_run
    async with session_factory.begin() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        failed = await repository.append_event(
            run_id,
            {
                "type": "run_failed",
                "error_code": "WORKER_STALE",
                "message": "stale",
            },
        )
        late = await repository.append_event(
            run_id, {"type": "agent_message_delta", "content": "late"}
        )

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        run = await repository.get(run_id)
        events = await repository.list_events(run_id)

    assert failed.sequence == 1
    assert late.sequence == 1
    assert run is not None and run.last_sequence == 1
    assert [event.event_type for event in events] == ["run_failed"]


async def test_second_terminal_event_is_rejected_and_not_persisted(
    session_factory, seeded_run
) -> None:
    run_id, _ = seeded_run
    async with session_factory.begin() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        await repository.append_event(run_id, {"type": "run_completed"})

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        with pytest.raises(InvalidRunTransition):
            async with db_session.begin():
                await repository.append_event(run_id, {"type": "run_completed"})

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        run = await repository.get(run_id)
        events = await repository.list_events(run_id)

    assert run is not None and run.last_sequence == 1
    assert [event.event_type for event in events] == ["run_completed"]


@pytest.mark.parametrize(
    "late_terminal_event",
    [
        {"type": "run_completed"},
        {"type": "run_failed", "error_code": "AGENT_ERROR", "message": "failed"},
        {"type": "run_cancelled"},
    ],
)
async def test_cancelled_run_rejects_late_terminal_event_without_persisting(
    session_factory, seeded_run, late_terminal_event
) -> None:
    run_id, _ = seeded_run
    async with session_factory.begin() as db_session:
        await SqlAlchemyRunRepository(db_session).append_event(
            run_id, {"type": "run_cancelled"}
        )

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        with pytest.raises(InvalidRunTransition):
            async with db_session.begin():
                await repository.append_event(run_id, late_terminal_event)

    async with session_factory() as db_session:
        repository = SqlAlchemyRunRepository(db_session)
        run = await repository.get(run_id)
        events = await repository.list_events(run_id)

    assert run is not None and run.last_sequence == 1
    assert [event.event_type for event in events] == ["run_cancelled"]
