"""Testable worker runtime and PostgreSQL-backed delivery primitives."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from domain.models import Principal, Run, RunKind, RunStatus, Usage
from domain.ports import (
    CredentialLease,
    CredentialLeaseKey,
    CredentialLeaseStore,
    McpAuthFailed,
    McpReadinessError,
    McpReadinessPreflight,
    McpTokenExchange,
    RunDispatcher,
    TraceContext,
)
from infrastructure.agent.deepagent_adapter import (
    AgentCommand,
    AgentOperation,
)
from infrastructure.database.models import MessageRow, RunRow, SessionRow
from infrastructure.database.repositories import SqlAlchemyRunRepository

_ACTIVE = (
    RunStatus.RUNNING.value,
    RunStatus.AWAITING_APPROVAL.value,
    RunStatus.AWAITING_USER_ANSWER.value,
)
_PAUSED = (
    RunStatus.AWAITING_APPROVAL,
    RunStatus.AWAITING_USER_ANSWER,
)
_TERMINAL_EVENTS = frozenset(
    {"run_completed", "run_failed", "run_cancelled"}
)


class ClaimMode(StrEnum):
    EXECUTE = "execute"
    CANCEL_REPAIR = "cancel_repair"


@dataclass(frozen=True, slots=True)
class RunClaim:
    mode: ClaimMode
    run: Run
    owner: Principal
    prompt: str | None


@dataclass(frozen=True, slots=True)
class RecoveryRun:
    run_id: UUID
    session_id: UUID
    owner: Principal


class WorkerRunOperations(Protocol):
    async def claim_for_execution(self, run_id: UUID) -> RunClaim | None: ...

    async def cancel_requested(self, run_id: UUID) -> bool: ...

    async def heartbeat(self, run_id: UUID) -> None: ...

    async def append_event(self, run_id: UUID, event: dict[str, Any]) -> None: ...

    async def dispatch_next_after_terminal(
        self,
        run_id: UUID,
        credential_lease_key: str,
        trace_context: TraceContext,
    ) -> None: ...


class WorkerCredentials(Protocol):
    def key_for(self, principal: Principal) -> CredentialLeaseKey: ...

    async def worker_token(
        self,
        lease_key: str,
        *,
        retry_exchange_once: bool,
    ) -> str: ...


class WorkerAgent(Protocol):
    def execute(self, command: AgentCommand) -> AsyncIterator[dict[str, Any]]: ...


class CheckpointRepair(Protocol):
    async def repair_cancelled_run(self, session_id: UUID) -> None: ...


def _run_from_row(row: RunRow) -> Run:
    return Run(
        id=row.run_id,
        session_id=row.session_id,
        status=RunStatus(row.status),
        kind=RunKind(row.kind),
        model_id=row.model_id,
        last_sequence=row.last_sequence,
        cancel_requested=row.cancel_requested,
        error_code=row.error_code,
        error_message=row.error_message,
        pause_payload=dict(row.pause_payload),
        usage=Usage(row.input_tokens, row.output_tokens),
    )


def _safe_message(error: Exception) -> str:
    if isinstance(error, McpReadinessError):
        return "MCP is unavailable for this run"
    return "AI workflow execution failed"


class WorkerCredentialResolver:
    """Resolve a lease for a Worker, retrying one rejected token once."""

    def __init__(
        self,
        lease_store: CredentialLeaseStore,
        exchange: McpTokenExchange,
        preflight: McpReadinessPreflight,
        *,
        now: Callable[[], datetime] | None = None,
        minimum_validity: timedelta = timedelta(seconds=30),
    ) -> None:
        self._lease_store = lease_store
        self._exchange = exchange
        self._preflight = preflight
        self._now = now or (lambda: datetime.now(UTC))
        self._minimum_validity = minimum_validity

    def key_for(self, principal: Principal) -> CredentialLeaseKey:
        return self._lease_store.key_for(principal)

    async def worker_token(
        self,
        lease_key: str,
        *,
        retry_exchange_once: bool,
    ) -> str:
        key = CredentialLeaseKey(lease_key)
        lease = await self._lease_store.get(key)
        if lease is None:
            raise McpAuthFailed("MCP credential lease is missing")

        if lease.expires_at - self._now() < self._minimum_validity:
            pass
        else:
            try:
                await self._preflight.check(lease.mcp_token)
            except McpAuthFailed:
                pass
            else:
                return lease.mcp_token

        await self._lease_store.delete(key)
        if not retry_exchange_once:
            raise McpAuthFailed("MCP credential was rejected")

        exchanged = await self._exchange.exchange(lease.subject_token)
        if "mcp" not in exchanged.scopes:
            raise McpAuthFailed("Exchanged token is missing the MCP scope")
        if exchanged.expires_at - self._now() < self._minimum_validity:
            raise McpAuthFailed("Exchanged MCP token expires too soon")

        replacement = CredentialLease(
            subject_token=lease.subject_token,
            mcp_token=exchanged.access_token,
            expires_at=exchanged.expires_at,
            scopes=exchanged.scopes,
        )
        await self._preflight.check(replacement.mcp_token)
        await self._lease_store.put(key, replacement)
        return replacement.mcp_token


class SqlAlchemyWorkerRunStore:
    """Worker-only database operations, each bounded by its own transaction."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        dispatcher: RunDispatcher,
        *,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._dispatcher = dispatcher
        self._now = now or (lambda: datetime.now(UTC))

    async def claim_for_execution(self, run_id: UUID) -> RunClaim | None:
        async with self._session_factory.begin() as session:
            session_id = await session.scalar(
                select(RunRow.session_id).where(RunRow.run_id == run_id)
            )
            if session_id is None:
                return None
            owner_row = await session.scalar(
                select(SessionRow)
                .where(SessionRow.session_id == session_id)
                .with_for_update()
            )
            row = await session.scalar(
                select(RunRow)
                .where(RunRow.run_id == run_id)
                .with_for_update()
            )
            if row is None or owner_row is None:
                return None

            status = RunStatus(row.status)
            owner = Principal(owner_row.owner_issuer, owner_row.owner_subject)
            if status in _PAUSED and row.cancel_requested:
                return RunClaim(
                    ClaimMode.CANCEL_REPAIR,
                    _run_from_row(row),
                    owner,
                    None,
                )
            if status is not RunStatus.QUEUED or row.cancel_requested:
                return None

            blocker = await session.scalar(
                select(RunRow.run_id)
                .where(
                    RunRow.session_id == row.session_id,
                    RunRow.run_id != row.run_id,
                    RunRow.status.in_(_ACTIVE),
                )
                .limit(1)
            )
            if blocker is not None:
                return None

            now = self._now()
            row.status = RunStatus.RUNNING.value
            row.started_at = row.started_at or now
            row.heartbeat_at = now
            prompt = await session.scalar(
                select(MessageRow.content)
                .where(
                    MessageRow.run_id == row.run_id,
                    MessageRow.role == "user",
                )
                .order_by(MessageRow.ordinal.desc())
                .limit(1)
            )
            await session.flush()
            return RunClaim(
                ClaimMode.EXECUTE,
                _run_from_row(row),
                owner,
                prompt,
            )

    async def cancel_requested(self, run_id: UUID) -> bool:
        async with self._session_factory() as session:
            value = await session.scalar(
                select(RunRow.cancel_requested).where(RunRow.run_id == run_id)
            )
        return bool(value)

    async def heartbeat(self, run_id: UUID) -> None:
        async with self._session_factory.begin() as session:
            await session.execute(
                update(RunRow)
                .where(
                    RunRow.run_id == run_id,
                    RunRow.status == RunStatus.RUNNING.value,
                )
                .values(heartbeat_at=self._now())
            )

    async def append_event(self, run_id: UUID, event: dict[str, Any]) -> None:
        async with self._session_factory.begin() as session:
            await SqlAlchemyRunRepository(session).append_event(run_id, event)
            if event.get("type") in _TERMINAL_EVENTS:
                row = await session.get(RunRow, run_id)
                if row is not None:
                    row.completed_at = self._now()

    async def dispatch_next_after_terminal(
        self,
        run_id: UUID,
        credential_lease_key: str,
        trace_context: TraceContext,
    ) -> None:
        async with self._session_factory.begin() as session:
            queued = await SqlAlchemyRunRepository(
                session
            ).oldest_queued_after_terminal(run_id)
        if queued is not None:
            await self._dispatcher.dispatch(
                queued.id,
                credential_lease_key,
                trace_context,
            )

    async def fail_stale_runs(self, cutoff: datetime) -> list[RecoveryRun]:
        recovered: list[RecoveryRun] = []
        async with self._session_factory.begin() as session:
            rows = (
                await session.scalars(
                    select(RunRow)
                    .where(
                        RunRow.status == RunStatus.RUNNING.value,
                        RunRow.heartbeat_at.is_not(None),
                        RunRow.heartbeat_at < cutoff,
                    )
                    .order_by(RunRow.heartbeat_at, RunRow.run_id)
                    .with_for_update(skip_locked=True)
                )
            ).all()
            repository = SqlAlchemyRunRepository(session)
            for row in rows:
                owner_row = await session.get(SessionRow, row.session_id)
                if owner_row is None:
                    continue
                await repository.append_event(
                    row.run_id,
                    {
                        "type": "run_failed",
                        "error_code": "WORKER_STALE",
                        "message": "Worker heartbeat expired",
                    },
                )
                row.completed_at = self._now()
                recovered.append(
                    RecoveryRun(
                        row.run_id,
                        row.session_id,
                        Principal(
                            owner_row.owner_issuer,
                            owner_row.owner_subject,
                        ),
                    )
                )
        return recovered

    async def unblocked_queued_runs(self) -> list[RecoveryRun]:
        async with self._session_factory() as session:
            active_session_ids = set(
                (
                    await session.scalars(
                        select(RunRow.session_id).where(
                            RunRow.status.in_(_ACTIVE)
                        )
                    )
                ).all()
            )
            rows = (
                await session.execute(
                    select(RunRow, SessionRow)
                    .join(SessionRow, SessionRow.session_id == RunRow.session_id)
                    .where(RunRow.status == RunStatus.QUEUED.value)
                    .order_by(RunRow.created_at, RunRow.run_id)
                )
            ).all()

        selected: list[RecoveryRun] = []
        seen: set[UUID] = set()
        for row, owner_row in rows:
            if row.session_id in active_session_ids or row.session_id in seen:
                continue
            seen.add(row.session_id)
            selected.append(
                RecoveryRun(
                    row.run_id,
                    row.session_id,
                    Principal(owner_row.owner_issuer, owner_row.owner_subject),
                )
            )
        return selected

    async def dispatch_recovery_run(
        self,
        recovery: RecoveryRun,
        credential_lease_key: str,
    ) -> None:
        await self._dispatcher.dispatch(
            recovery.run_id,
            credential_lease_key,
            TraceContext(request_id="ai-scheduler"),
        )


class WorkerRuntime:
    def __init__(
        self,
        runs: WorkerRunOperations,
        credentials: WorkerCredentials,
        agent: WorkerAgent,
        checkpoints: CheckpointRepair,
        *,
        heartbeat_seconds: float = 15.0,
    ) -> None:
        self._runs = runs
        self._credentials = credentials
        self._agent = agent
        self._checkpoints = checkpoints
        self._heartbeat_seconds = max(0.001, heartbeat_seconds)

    async def execute(
        self,
        run_id: UUID,
        credential_lease_key: str | None,
        trace_context: TraceContext,
    ) -> None:
        claim = await self._runs.claim_for_execution(run_id)
        if claim is None:
            return

        handoff_key = credential_lease_key or self._credentials.key_for(
            claim.owner
        ).value
        if claim.mode is ClaimMode.CANCEL_REPAIR:
            await self._checkpoints.repair_cancelled_run(claim.run.session_id)
            await self._runs.append_event(run_id, {"type": "run_cancelled"})
            await self._runs.dispatch_next_after_terminal(
                run_id, handoff_key, trace_context
            )
            return

        heartbeat_stop = asyncio.Event()
        heartbeat_task = asyncio.create_task(
            self._heartbeat_loop(run_id, heartbeat_stop)
        )
        try:
            if credential_lease_key is None:
                raise McpAuthFailed("MCP credential lease is missing")
            token = await self._credentials.worker_token(
                credential_lease_key,
                retry_exchange_once=True,
            )
            command = self._command_for(claim, token)
            async for event in self._agent.execute(command):
                if await self._runs.cancel_requested(run_id):
                    await self._checkpoints.repair_cancelled_run(
                        claim.run.session_id
                    )
                    await self._runs.append_event(
                        run_id, {"type": "run_cancelled"}
                    )
                    return
                await self._runs.append_event(run_id, event)
        except McpReadinessError as error:
            await self._runs.append_event(
                run_id,
                {
                    "type": "run_failed",
                    "error_code": error.code,
                    "message": _safe_message(error),
                },
            )
        except Exception as error:
            await self._runs.append_event(
                run_id,
                {
                    "type": "run_failed",
                    "error_code": "AGENT_ERROR",
                    "message": _safe_message(error),
                },
            )
        finally:
            heartbeat_stop.set()
            heartbeat_task.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat_task
            await self._runs.dispatch_next_after_terminal(
                run_id, handoff_key, trace_context
            )

    async def _heartbeat_loop(
        self, run_id: UUID, stop: asyncio.Event
    ) -> None:
        while True:
            try:
                await asyncio.wait_for(
                    stop.wait(), timeout=self._heartbeat_seconds
                )
                return
            except TimeoutError:
                await self._runs.heartbeat(run_id)

    @staticmethod
    def _command_for(claim: RunClaim, mcp_token: str) -> AgentCommand:
        run = claim.run
        if run.kind is RunKind.CHAT:
            if not claim.prompt:
                raise ValueError("Queued chat run has no user prompt")
            return AgentCommand(
                run_id=run.id,
                session_id=run.session_id,
                operation=AgentOperation.START,
                prompt=claim.prompt,
                model_id=run.model_id,
                mcp_token=mcp_token,
                approval=None,
                answer=None,
            )

        payload = run.pause_payload.get("command")
        if not isinstance(payload, dict):
            raise ValueError("Resume run has no persisted command")
        command_type = payload.get("type")
        if command_type == "answer":
            answer = payload.get("answer")
            if not isinstance(answer, str):
                raise ValueError("Resume answer must be a string")
            operation = AgentOperation.ANSWER
            approval = None
        elif command_type == "approval":
            decision = payload.get("decision")
            if not isinstance(decision, str):
                raise ValueError("Approval decision must be a string")
            operation = AgentOperation.APPROVE
            approval = {"decision": decision}
            answer = None
        else:
            raise ValueError("Unsupported persisted resume command")
        return AgentCommand(
            run_id=run.id,
            session_id=run.session_id,
            operation=operation,
            prompt=None,
            model_id=run.model_id,
            mcp_token=mcp_token,
            approval=approval,
            answer=answer,
        )
