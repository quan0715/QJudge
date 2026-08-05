"""Run command behavior independent of SQLAlchemy and Celery."""

from __future__ import annotations

from dataclasses import replace
from typing import Any
from uuid import UUID, uuid4

import pytest

from application.run_service import (
    InvalidRunState,
    RunCancellationRequested,
    RunNotFound,
    RunService,
)
from domain.models import Principal, Run, RunKind, RunStatus, Session
from domain.ports import CredentialLeaseKey, McpUnavailable, TraceContext
from infrastructure.queue.celery_dispatcher import CeleryRunDispatcher


class FakeCredentialService:
    def __init__(self) -> None:
        self.error: Exception | None = None
        self.calls: list[tuple[Principal, str]] = []

    async def ensure_ready(
        self, principal: Principal, subject_token: str
    ) -> CredentialLeaseKey:
        self.calls.append((principal, subject_token))
        if self.error is not None:
            raise self.error
        return CredentialLeaseKey(f"lease:{principal.subject}")


class FakeSessionRepository:
    def __init__(self, sessions: dict[UUID, Session]) -> None:
        self.sessions = sessions

    async def get_for_update(
        self, principal: Principal, session_id: UUID
    ) -> Session | None:
        session = self.sessions.get(session_id)
        return session if session is not None and session.owner == principal else None


class FakeRunRepository:
    def __init__(self, runs: dict[UUID, Run], idempotency: dict[tuple[UUID, str], UUID]) -> None:
        self.runs = runs
        self.idempotency = idempotency

    async def get_by_idempotency_key(
        self, session_id: UUID, idempotency_key: str
    ) -> Run | None:
        run_id = self.idempotency.get((session_id, idempotency_key))
        return self.runs.get(run_id) if run_id is not None else None

    async def create_queued(
        self, session_id: UUID, model_id: str, idempotency_key: str
    ) -> Run:
        run = Run(
            id=uuid4(),
            session_id=session_id,
            status=RunStatus.QUEUED,
            kind=RunKind.CHAT,
            model_id=model_id,
        )
        self.runs[run.id] = run
        self.idempotency[(session_id, idempotency_key)] = run.id
        return run

    async def has_blocking_run(self, session_id: UUID, excluding: UUID) -> bool:
        return any(
            run.session_id == session_id
            and run.id != excluding
            and run.status
            in {
                RunStatus.RUNNING,
                RunStatus.AWAITING_APPROVAL,
                RunStatus.AWAITING_USER_ANSWER,
            }
            for run in self.runs.values()
        )

    async def get_for_owner(
        self, principal: Principal, run_id: UUID
    ) -> Run | None:
        run = self.runs.get(run_id)
        if run is None:
            return None
        session = self.sessions[run.session_id]
        return run if session.owner == principal else None

    async def get_for_update(
        self, principal: Principal, run_id: UUID
    ) -> Run | None:
        return await self.get_for_owner(principal, run_id)

    async def update(self, run: Run) -> Run:
        self.runs[run.id] = run
        return run

    async def oldest_queued_after_terminal(self, run_id: UUID) -> Run | None:
        terminal = self.runs.get(run_id)
        if terminal is None or terminal.status not in {
            RunStatus.COMPLETED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
        }:
            return None
        candidates = [
            run
            for run in self.runs.values()
            if run.session_id == terminal.session_id
            and run.status is RunStatus.QUEUED
        ]
        return candidates[0] if candidates else None


class FakeMessageRepository:
    def __init__(self) -> None:
        self.pairs: list[tuple[UUID, UUID, str]] = []

    async def append_pair(
        self, session: Session, run_id: UUID, prompt: str
    ) -> tuple[Any, Any]:
        self.pairs.append((session.id, run_id, prompt))
        return object(), object()


class FakeUnitOfWork:
    def __init__(self, state: "FakeState") -> None:
        self.state = state
        self.sessions = FakeSessionRepository(state.sessions)
        self.runs = FakeRunRepository(state.runs, state.idempotency)
        self.runs.sessions = state.sessions
        self.messages = state.messages

    async def __aenter__(self) -> "FakeUnitOfWork":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if exc_type is None:
            self.state.commits += 1


class FakeState:
    def __init__(self) -> None:
        self.sessions: dict[UUID, Session] = {}
        self.runs: dict[UUID, Run] = {}
        self.idempotency: dict[tuple[UUID, str], UUID] = {}
        self.messages = FakeMessageRepository()
        self.commits = 0


class RecordingDispatcher:
    def __init__(self, state: FakeState) -> None:
        self.state = state
        self.calls: list[tuple[UUID, str | None, TraceContext]] = []
        self.commit_counts: list[int] = []

    @property
    def run_ids(self) -> list[UUID]:
        return [call[0] for call in self.calls]

    async def dispatch(
        self,
        run_id: UUID,
        credential_lease_key: str | None,
        trace_context: TraceContext,
    ) -> None:
        self.calls.append((run_id, credential_lease_key, trace_context))
        self.commit_counts.append(self.state.commits)


@pytest.fixture
def principal() -> Principal:
    return Principal(issuer="https://issuer.test", subject="teacher-1")


@pytest.fixture
def state(principal: Principal) -> FakeState:
    value = FakeState()
    session = Session(id=uuid4(), owner=principal, title="Chat", context={})
    value.sessions[session.id] = session
    return value


@pytest.fixture
def credential_service() -> FakeCredentialService:
    return FakeCredentialService()


@pytest.fixture
def run_service(state: FakeState, credential_service: FakeCredentialService) -> RunService:
    dispatcher = RecordingDispatcher(state)
    service = RunService(
        lambda: FakeUnitOfWork(state),
        credential_service,
        dispatcher,
        trace_provider=lambda: TraceContext(request_id="request-1", traceparent=None),
    )
    service.dispatcher = dispatcher
    return service


async def test_duplicate_idempotency_key_returns_the_same_run(
    run_service: RunService,
    principal: Principal,
    state: FakeState,
    credential_service: FakeCredentialService,
) -> None:
    session = next(iter(state.sessions.values()))
    first = await run_service.start(
        principal, session.id, "hello", "deepseek-v4", "same-key", "ai-token"
    )
    second = await run_service.start(
        principal, session.id, "hello", "deepseek-v4", "same-key", "ai-token"
    )

    assert second.id == first.id
    assert run_service.dispatcher.run_ids == [first.id]
    assert state.messages.pairs == [(session.id, first.id, "hello")]
    assert len(credential_service.calls) == 2
    assert run_service.dispatcher.commit_counts == [1]


async def test_second_run_stays_queued_while_session_has_a_blocker(
    run_service: RunService, principal: Principal, state: FakeState
) -> None:
    session = next(iter(state.sessions.values()))
    first = await run_service.start(
        principal, session.id, "one", "deepseek-v4", "key-1", "token"
    )
    state.runs[first.id] = replace(first, status=RunStatus.RUNNING)

    second = await run_service.start(
        principal, session.id, "two", "deepseek-v4", "key-2", "token"
    )

    assert second.status is RunStatus.QUEUED
    assert run_service.dispatcher.run_ids == [first.id]


async def test_failed_answer_preflight_leaves_paused_run_unchanged(
    run_service: RunService,
    principal: Principal,
    state: FakeState,
    credential_service: FakeCredentialService,
) -> None:
    session = next(iter(state.sessions.values()))
    paused = Run(
        id=uuid4(),
        session_id=session.id,
        status=RunStatus.AWAITING_USER_ANSWER,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
        pause_payload={"question": "Continue?"},
    )
    state.runs[paused.id] = paused
    credential_service.error = McpUnavailable("offline")

    with pytest.raises(McpUnavailable):
        await run_service.answer(principal, paused.id, "yes", "token")

    assert (await run_service.get(principal, paused.id)).status is RunStatus.AWAITING_USER_ANSWER
    assert run_service.dispatcher.calls == []


async def test_failed_start_preflight_creates_no_run_or_messages(
    run_service: RunService,
    principal: Principal,
    state: FakeState,
    credential_service: FakeCredentialService,
) -> None:
    session = next(iter(state.sessions.values()))
    credential_service.error = McpUnavailable("offline")

    with pytest.raises(McpUnavailable):
        await run_service.start(
            principal,
            session.id,
            "never accepted",
            "deepseek-v4",
            "offline",
            "token",
        )

    assert state.runs == {}
    assert state.messages.pairs == []
    assert state.commits == 0


async def test_approve_and_answer_resume_the_same_run_after_preflight(
    run_service: RunService, principal: Principal, state: FakeState
) -> None:
    session = next(iter(state.sessions.values()))
    approval = Run(
        id=uuid4(),
        session_id=session.id,
        status=RunStatus.AWAITING_APPROVAL,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
        pause_payload={"action_requests": [{"name": "write"}]},
    )
    answer = replace(
        approval,
        id=uuid4(),
        status=RunStatus.AWAITING_USER_ANSWER,
        pause_payload={"question": "Name?"},
    )
    state.runs.update({approval.id: approval, answer.id: answer})

    approved = await run_service.approve(
        principal, approval.id, "approve", "token-a"
    )
    answered = await run_service.answer(principal, answer.id, "Quan", "token-b")

    assert approved.id == approval.id and approved.kind is RunKind.RESUME
    assert approved.status is RunStatus.QUEUED
    assert approved.pause_payload["command"] == {
        "type": "approval",
        "decision": "approve",
    }
    assert answered.id == answer.id and answered.kind is RunKind.RESUME
    assert answered.status is RunStatus.QUEUED
    assert answered.pause_payload["command"] == {
        "type": "answer",
        "answer": "Quan",
    }
    assert run_service.dispatcher.run_ids == [approval.id, answer.id]


async def test_paused_cancel_dispatches_repair_once_without_credentials(
    run_service: RunService,
    principal: Principal,
    state: FakeState,
    credential_service: FakeCredentialService,
) -> None:
    session = next(iter(state.sessions.values()))
    paused = Run(
        id=uuid4(),
        session_id=session.id,
        status=RunStatus.AWAITING_USER_ANSWER,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
    )
    state.runs[paused.id] = paused

    first = await run_service.cancel(principal, paused.id)
    second = await run_service.cancel(principal, paused.id)

    assert first.cancel_requested and second.cancel_requested
    assert first.status is RunStatus.AWAITING_USER_ANSWER
    assert run_service.dispatcher.run_ids == [paused.id]
    assert run_service.dispatcher.calls[0][1] is None
    assert credential_service.calls == []


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (RunStatus.QUEUED, RunStatus.CANCELLED),
        (RunStatus.RUNNING, RunStatus.RUNNING),
    ],
)
async def test_cancel_marks_queued_or_running_without_new_dispatch(
    run_service: RunService,
    principal: Principal,
    state: FakeState,
    source: RunStatus,
    expected: RunStatus,
) -> None:
    session = next(iter(state.sessions.values()))
    run = Run(
        id=uuid4(),
        session_id=session.id,
        status=source,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
    )
    state.runs[run.id] = run

    cancelled = await run_service.cancel(principal, run.id)

    assert cancelled.status is expected
    assert cancelled.cancel_requested
    assert run_service.dispatcher.calls == []


async def test_cancel_race_cannot_be_resurrected_by_answer(
    run_service: RunService, principal: Principal, state: FakeState
) -> None:
    session = next(iter(state.sessions.values()))
    paused = Run(
        id=uuid4(),
        session_id=session.id,
        status=RunStatus.AWAITING_USER_ANSWER,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
        cancel_requested=True,
    )
    state.runs[paused.id] = paused

    with pytest.raises(RunCancellationRequested):
        await run_service.answer(principal, paused.id, "too late", "token")

    assert state.runs[paused.id] == paused
    assert run_service.dispatcher.calls == []


async def test_get_is_owner_scoped_and_never_checks_mcp(
    run_service: RunService,
    principal: Principal,
    state: FakeState,
    credential_service: FakeCredentialService,
) -> None:
    session = next(iter(state.sessions.values()))
    run = Run(
        id=uuid4(),
        session_id=session.id,
        status=RunStatus.RUNNING,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
    )
    state.runs[run.id] = run

    assert await run_service.get(principal, run.id) == run
    with pytest.raises(RunNotFound):
        await run_service.get(replace(principal, subject="other"), run.id)
    assert credential_service.calls == []


async def test_invalid_resume_state_does_not_mutate_run(
    run_service: RunService, principal: Principal, state: FakeState
) -> None:
    session = next(iter(state.sessions.values()))
    run = Run(
        id=uuid4(),
        session_id=session.id,
        status=RunStatus.RUNNING,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
    )
    state.runs[run.id] = run

    with pytest.raises(InvalidRunState):
        await run_service.answer(principal, run.id, "late", "token")
    assert state.runs[run.id] == run


async def test_terminal_handoff_dispatches_oldest_queued_after_commit(
    run_service: RunService, principal: Principal, state: FakeState
) -> None:
    session = next(iter(state.sessions.values()))
    terminal = Run(
        id=uuid4(),
        session_id=session.id,
        status=RunStatus.COMPLETED,
        kind=RunKind.CHAT,
        model_id="deepseek-v4",
    )
    queued = replace(terminal, id=uuid4(), status=RunStatus.QUEUED)
    state.runs.update({terminal.id: terminal, queued.id: queued})

    selected = await run_service.dispatch_next_after_terminal(
        terminal.id, "lease:teacher-1"
    )

    assert selected == queued
    assert run_service.dispatcher.calls[0][0:2] == (
        queued.id,
        "lease:teacher-1",
    )
    assert run_service.dispatcher.commit_counts == [1]


class FakeCeleryApp:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def send_task(self, name: str, **kwargs: Any) -> None:
        self.calls.append({"name": name, **kwargs})


async def test_celery_dispatcher_uses_run_id_as_task_id_and_propagates_trace() -> None:
    app = FakeCeleryApp()
    dispatcher = CeleryRunDispatcher(app)
    run_id = uuid4()

    await dispatcher.dispatch(
        run_id,
        "lease-key",
        TraceContext(request_id="req-1", traceparent="00-trace-parent"),
    )

    assert app.calls == [
        {
            "name": "ai.execute_run",
            "task_id": str(run_id),
            "kwargs": {
                "run_id": str(run_id),
                "credential_lease_key": "lease-key",
                "trace_context": {
                    "request_id": "req-1",
                    "traceparent": "00-trace-parent",
                },
            },
        }
    ]
