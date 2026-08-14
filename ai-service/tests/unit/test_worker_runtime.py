from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from domain.models import Principal, Run, RunKind, RunStatus
from domain.ports import (
    CredentialLease,
    CredentialLeaseKey,
    ExchangedToken,
    McpAuthFailed,
    McpUnavailable,
    TraceContext,
)
from infrastructure.agent.deepagent_adapter import AgentOperation
from worker.runtime import (
    ClaimMode,
    RunClaim,
    WorkerCredentialResolver,
    WorkerRuntime,
)

TRACE = TraceContext(request_id="request-1", traceparent="trace-1")


class FakeRuns:
    def __init__(self, run: Run, owner: Principal, *, prompt: str = "hello") -> None:
        self.run = run
        self.owner = owner
        self.prompt = prompt
        self.claims = 0
        self.events: list[dict] = []
        self.heartbeats = 0
        self.dispatches: list[tuple] = []
        self._lock = asyncio.Lock()

    async def claim_for_execution(self, run_id):
        async with self._lock:
            if self.run.id != run_id:
                return None
            if self.run.status is RunStatus.QUEUED:
                self.run = replace(self.run, status=RunStatus.RUNNING)
                self.claims += 1
                return RunClaim(ClaimMode.EXECUTE, self.run, self.owner, self.prompt)
            if (
                self.run.status
                in {RunStatus.AWAITING_APPROVAL, RunStatus.AWAITING_USER_ANSWER}
                and self.run.cancel_requested
            ):
                self.claims += 1
                return RunClaim(ClaimMode.CANCEL_REPAIR, self.run, self.owner, None)
            return None

    async def cancel_requested(self, run_id):
        return self.run.cancel_requested

    async def heartbeat(self, run_id, execution_epoch):
        self.heartbeats += 1
        return True

    async def execution_active(self, run_id, execution_epoch):
        return self.run.status is RunStatus.RUNNING

    async def begin_cancel_repair(self, run_id, execution_epoch):
        return True

    async def append_event(self, run_id, execution_epoch, event):
        self.events.append(event)
        if event["type"] == "run_completed":
            self.run = replace(self.run, status=RunStatus.COMPLETED)
        elif event["type"] == "run_cancelled":
            self.run = replace(self.run, status=RunStatus.CANCELLED)
        elif event["type"] == "run_failed":
            self.run = replace(
                self.run,
                status=RunStatus.FAILED,
                error_code=event["error_code"],
            )
        return True

    async def complete_cancel_repair(self, run_id, execution_epoch):
        return await self.append_event(
            run_id, execution_epoch, {"type": "run_cancelled"}
        )

    async def dispatch_next_after_terminal(self, run_id, lease_key, trace):
        self.dispatches.append((run_id, lease_key, trace))


class FakeCredentials:
    def __init__(self, *, token: str = "mcp-token", error=None) -> None:
        self.token = token
        self.error = error
        self.calls = 0

    def key_for(self, principal):
        return CredentialLeaseKey(f"lease:{principal.subject}")

    async def worker_token(self, lease_key, *, retry_exchange_once):
        self.calls += 1
        assert retry_exchange_once is True
        if self.error:
            raise self.error
        return self.token


class FakeAgent:
    def __init__(self, events=None) -> None:
        self.events = events or [
            {"type": "usage_report", "input_tokens": 4, "output_tokens": 2},
            {"type": "run_completed"},
        ]
        self.commands = []

    async def execute(self, command) -> AsyncIterator[dict]:
        self.commands.append(command)
        for event in self.events:
            yield event


class SlowAgent(FakeAgent):
    async def execute(self, command) -> AsyncIterator[dict]:
        self.commands.append(command)
        await asyncio.sleep(0.035)
        yield {"type": "run_completed"}


class CloseAwareAgent(FakeAgent):
    def __init__(self) -> None:
        super().__init__()
        self.closed = False

    async def execute(self, command) -> AsyncIterator[dict]:
        self.commands.append(command)
        try:
            yield {"type": "run_completed"}
        finally:
            self.closed = True


class FakeCheckpoints:
    def __init__(self) -> None:
        self.repairs = []

    async def repair_cancelled_run(self, session_id):
        self.repairs.append(session_id)


def make_run(**changes) -> Run:
    run = Run(
        id=uuid4(),
        session_id=uuid4(),
        status=RunStatus.QUEUED,
        kind=RunKind.CHAT,
        model_id="deepseek-v4-flash",
    )
    return replace(run, **changes)


@pytest.mark.asyncio
async def test_duplicate_delivery_calls_agent_once() -> None:
    run = make_run()
    runs = FakeRuns(run, Principal("issuer", "subject"))
    agent = FakeAgent()
    runtime = WorkerRuntime(
        runs, FakeCredentials(), agent, FakeCheckpoints(), heartbeat_seconds=0.01
    )

    await asyncio.gather(
        runtime.execute(run.id, "lease:subject", TRACE),
        runtime.execute(run.id, "lease:subject", TRACE),
    )

    assert [command.run_id for command in agent.commands] == [run.id]
    assert runs.claims == 1


@pytest.mark.asyncio
async def test_foreign_lease_key_fails_before_credentials_or_agent() -> None:
    run = make_run()
    owner = Principal("issuer", "subject")
    runs = FakeRuns(run, owner)
    credentials = FakeCredentials()
    agent = FakeAgent()
    runtime = WorkerRuntime(runs, credentials, agent, FakeCheckpoints())

    await runtime.execute(run.id, "lease:another-subject", TRACE)

    assert credentials.calls == 0
    assert agent.commands == []
    assert runs.run.error_code == "MCP_AUTH_FAILED"


@pytest.mark.asyncio
async def test_unrecoverable_mcp_failure_never_calls_model() -> None:
    run = make_run()
    runs = FakeRuns(run, Principal("issuer", "subject"))
    agent = FakeAgent()
    runtime = WorkerRuntime(
        runs,
        FakeCredentials(error=McpUnavailable("offline")),
        agent,
        FakeCheckpoints(),
    )

    await runtime.execute(run.id, "lease:subject", TRACE)

    assert agent.commands == []
    assert runs.run.error_code == "MCP_UNAVAILABLE"
    assert runs.dispatches == [(run.id, "lease:subject", TRACE)]


@pytest.mark.asyncio
async def test_paused_cancel_repairs_without_credentials_or_agent() -> None:
    run = make_run(
        status=RunStatus.AWAITING_USER_ANSWER,
        cancel_requested=True,
    )
    owner = Principal("issuer", "subject")
    runs = FakeRuns(run, owner)
    credentials = FakeCredentials(error=AssertionError("must not resolve"))
    agent = FakeAgent()
    checkpoints = FakeCheckpoints()
    runtime = WorkerRuntime(runs, credentials, agent, checkpoints)

    await runtime.execute(run.id, None, TRACE)

    assert credentials.calls == 0
    assert agent.commands == []
    assert checkpoints.repairs == [run.session_id]
    assert runs.events == [{"type": "run_cancelled"}]
    assert runs.dispatches == [(run.id, "lease:subject", TRACE)]


@pytest.mark.asyncio
async def test_heartbeat_runs_independently_of_agent_events() -> None:
    run = make_run()
    runs = FakeRuns(run, Principal("issuer", "subject"))
    runtime = WorkerRuntime(
        runs,
        FakeCredentials(),
        SlowAgent(),
        FakeCheckpoints(),
        heartbeat_seconds=0.005,
    )

    await runtime.execute(run.id, "lease:subject", TRACE)

    assert runs.heartbeats >= 2


@pytest.mark.asyncio
async def test_terminal_event_closes_agent_transport_before_task_returns() -> None:
    run = make_run()
    runs = FakeRuns(run, Principal("issuer", "subject"))
    agent = CloseAwareAgent()
    runtime = WorkerRuntime(runs, FakeCredentials(), agent, FakeCheckpoints())

    await runtime.execute(run.id, "lease:subject", TRACE)

    assert agent.closed is True


@pytest.mark.asyncio
async def test_resume_command_uses_persisted_answer() -> None:
    run = make_run(
        kind=RunKind.RESUME,
        pause_payload={"command": {"type": "answer", "answer": "yes"}},
    )
    runs = FakeRuns(run, Principal("issuer", "subject"), prompt="ignored")
    agent = FakeAgent([{"type": "run_completed"}])
    runtime = WorkerRuntime(runs, FakeCredentials(), agent, FakeCheckpoints())

    await runtime.execute(run.id, "lease:subject", TRACE)

    assert agent.commands[0].operation is AgentOperation.ANSWER
    assert agent.commands[0].answer == "yes"
    assert agent.commands[0].prompt is None


class LeaseStore:
    def __init__(self, lease: CredentialLease) -> None:
        self.lease = lease
        self.puts = []
        self.deletes = 0

    def key_for(self, principal):
        return CredentialLeaseKey(f"lease:{principal.subject}")

    async def get(self, key):
        return self.lease

    async def put(self, key, lease):
        self.lease = lease
        self.puts.append((key, lease))

    async def delete(self, key):
        self.deletes += 1

    @asynccontextmanager
    async def refresh_lock(self, key):
        yield


class Preflight:
    def __init__(self) -> None:
        self.tokens = []

    async def check(self, token):
        self.tokens.append(token)
        if token == "expired":
            raise McpAuthFailed("expired")


class Exchange:
    def __init__(self) -> None:
        self.calls = 0

    async def exchange(self, subject_token):
        self.calls += 1
        return ExchangedToken(
            access_token="replacement-token",
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
            scopes=frozenset({"mcp"}),
        )


@pytest.mark.asyncio
async def test_mcp_401_forces_one_exchange_before_agent() -> None:
    lease = CredentialLease(
        subject_token="subject-token",
        mcp_token="expired",
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        scopes=frozenset({"mcp"}),
    )
    store = LeaseStore(lease)
    exchange = Exchange()
    preflight = Preflight()
    resolver = WorkerCredentialResolver(store, exchange, preflight)

    token = await resolver.worker_token(
        "lease-key", retry_exchange_once=True
    )

    assert token == "replacement-token"
    assert exchange.calls == 1
    assert preflight.tokens == ["expired", "replacement-token"]
    assert store.deletes == 1
    assert len(store.puts) == 1


def test_celery_application_uses_ai_queue_and_namespace() -> None:
    from worker.celery_app import celery_app
    from worker.tasks import (
        dispatch_unblocked_sessions,
        execute_run,
        recover_stale_runs,
    )

    assert celery_app.main == "qjudge_ai"
    assert celery_app.conf.task_default_queue == "qjudge-ai"
    assert celery_app.conf.task_routes == {"ai.*": {"queue": "qjudge-ai"}}
    assert celery_app.conf.broker_transport_options["global_keyprefix"] == (
        "qjudge-ai:"
    )
    assert execute_run.name == "ai.execute_run"
    assert recover_stale_runs.name == "ai.recover_stale_runs"
    assert dispatch_unblocked_sessions.name == "ai.dispatch_unblocked_sessions"
