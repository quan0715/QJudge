"""Idempotent run commands with owner scope and post-commit dispatch."""

from __future__ import annotations

from collections.abc import Callable
from contextvars import ContextVar, Token
from dataclasses import replace
from uuid import UUID

from application.credential_service import CredentialService
from domain.errors import RepositoryConflict
from domain.models import Principal, Run, RunKind, RunStatus
from domain.ports import RunDispatcher, TraceContext, UnitOfWork

_CURRENT_TRACE: ContextVar[TraceContext] = ContextVar(
    "ai_current_trace", default=TraceContext()
)
_PAUSED = frozenset(
    {RunStatus.AWAITING_APPROVAL, RunStatus.AWAITING_USER_ANSWER}
)
_TERMINAL = frozenset(
    {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
)


def current_trace() -> TraceContext:
    return _CURRENT_TRACE.get()


def set_current_trace(trace: TraceContext) -> Token[TraceContext]:
    return _CURRENT_TRACE.set(trace)


def reset_current_trace(token: Token[TraceContext]) -> None:
    _CURRENT_TRACE.reset(token)


class SessionNotFound(LookupError):
    def __init__(self, session_id: UUID) -> None:
        self.session_id = session_id
        super().__init__(f"Session {session_id} was not found")


class RunNotFound(LookupError):
    def __init__(self, run_id: UUID) -> None:
        self.run_id = run_id
        super().__init__(f"Run {run_id} was not found")


class InvalidRunState(ValueError):
    def __init__(self, run_id: UUID, expected: RunStatus, actual: RunStatus) -> None:
        self.run_id = run_id
        self.expected = expected
        self.actual = actual
        super().__init__(
            f"Run {run_id} must be {expected.value}, not {actual.value}"
        )


class RunCancellationRequested(ValueError):
    def __init__(self, run_id: UUID) -> None:
        self.run_id = run_id
        super().__init__(f"Run {run_id} is already being cancelled")


class RunService:
    def __init__(
        self,
        uow_factory: Callable[[], UnitOfWork],
        credentials: CredentialService,
        dispatcher: RunDispatcher,
        *,
        trace_provider: Callable[[], TraceContext] = current_trace,
    ) -> None:
        self._uow_factory = uow_factory
        self._credentials = credentials
        self._dispatcher = dispatcher
        self._trace_provider = trace_provider

    async def start(
        self,
        principal: Principal,
        session_id: UUID,
        prompt: str,
        model_id: str,
        idempotency_key: str,
        subject_token: str,
    ) -> Run:
        lease_key = await self._credentials.ensure_ready(principal, subject_token)
        dispatch_after_commit = False
        try:
            async with self._uow_factory() as uow:
                session = await uow.sessions.get_for_update(principal, session_id)
                if session is None:
                    raise SessionNotFound(session_id)
                existing = await uow.runs.get_by_idempotency_key(
                    session.id, idempotency_key
                )
                if existing is not None:
                    return existing
                run = await uow.runs.create_queued(
                    session.id, model_id, idempotency_key
                )
                await uow.messages.append_pair(session, run.id, prompt)
                has_active_run = await uow.runs.has_blocking_run(
                    session.id, excluding=run.id
                )
                oldest_queued = await uow.runs.oldest_queued(session.id)
                dispatch_after_commit = (
                    not has_active_run
                    and oldest_queued is not None
                    and oldest_queued.id == run.id
                )
        except RepositoryConflict:
            # The unique constraint is authoritative if another process won a
            # race despite application-level locking.
            async with self._uow_factory() as uow:
                session = await uow.sessions.get_for_update(principal, session_id)
                if session is None:
                    raise SessionNotFound(session_id)
                existing = await uow.runs.get_by_idempotency_key(
                    session.id, idempotency_key
                )
                if existing is None:
                    raise
                return existing

        if dispatch_after_commit:
            await self._dispatcher.dispatch(
                run.id, lease_key.value, self._trace_provider()
            )
        return run

    async def get(self, principal: Principal, run_id: UUID) -> Run:
        async with self._uow_factory() as uow:
            run = await uow.runs.get_for_owner(principal, run_id)
            if run is None:
                raise RunNotFound(run_id)
            return run

    async def cancel(self, principal: Principal, run_id: UUID) -> Run:
        repair_after_commit = False
        async with self._uow_factory() as uow:
            run = await uow.runs.get_for_update(principal, run_id)
            if run is None:
                raise RunNotFound(run_id)
            if run.status in _TERMINAL or run.cancel_requested:
                return run

            if run.status is RunStatus.QUEUED:
                updated = replace(
                    run,
                    status=RunStatus.CANCELLED,
                    cancel_requested=True,
                )
            else:
                updated = replace(run, cancel_requested=True)
                repair_after_commit = run.status in _PAUSED
            updated = await uow.runs.update(updated)

        if repair_after_commit:
            await self._dispatcher.dispatch(
                run_id, None, self._trace_provider()
            )
        return updated

    async def approve(
        self,
        principal: Principal,
        run_id: UUID,
        decision: str,
        subject_token: str,
    ) -> Run:
        return await self._resume(
            principal,
            run_id,
            expected=RunStatus.AWAITING_APPROVAL,
            command={"type": "approval", "decision": decision},
            subject_token=subject_token,
        )

    async def answer(
        self,
        principal: Principal,
        run_id: UUID,
        answer: str,
        subject_token: str,
    ) -> Run:
        return await self._resume(
            principal,
            run_id,
            expected=RunStatus.AWAITING_USER_ANSWER,
            command={"type": "answer", "answer": answer},
            subject_token=subject_token,
        )

    async def dispatch_next_after_terminal(
        self,
        run_id: UUID,
        credential_lease_key: str,
        trace_context: TraceContext | None = None,
    ) -> Run | None:
        """Dispatch the oldest unblocked successor after terminal commit.

        The Worker calls this only after persisting the terminal event. The
        current run's owner-scoped lease key remains valid for its same-session
        successor; cancel-repair without a key is reconciled by the Worker path.
        """
        async with self._uow_factory() as uow:
            queued = await uow.runs.oldest_queued_after_terminal(run_id)
        if queued is None:
            return None
        await self._dispatcher.dispatch(
            queued.id,
            credential_lease_key,
            trace_context or self._trace_provider(),
        )
        return queued

    async def _resume(
        self,
        principal: Principal,
        run_id: UUID,
        *,
        expected: RunStatus,
        command: dict[str, str],
        subject_token: str,
    ) -> Run:
        # Readiness is deliberately established before the transaction that
        # mutates HITL state. A failed probe leaves the pause untouched.
        lease_key = await self._credentials.ensure_ready(principal, subject_token)
        async with self._uow_factory() as uow:
            run = await uow.runs.get_for_update(principal, run_id)
            if run is None:
                raise RunNotFound(run_id)
            if run.status is not expected:
                raise InvalidRunState(run_id, expected, run.status)
            if run.cancel_requested:
                raise RunCancellationRequested(run_id)
            updated = await uow.runs.update(
                replace(
                    run,
                    status=RunStatus.QUEUED,
                    kind=RunKind.RESUME,
                    pause_payload={**run.pause_payload, "command": command},
                )
            )

        await self._dispatcher.dispatch(
            run_id, lease_key.value, self._trace_provider()
        )
        return updated
