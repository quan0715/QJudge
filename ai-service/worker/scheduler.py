"""Operational reconciliation for stale and lost AI run deliveries."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol

from domain.models import Principal
from domain.ports import CredentialLeaseKey, TraceContext

from .runtime import CheckpointRepair, RecoveryRun


class SchedulableRuns(Protocol):
    async def fail_stale_runs(self, cutoff: datetime) -> list[RecoveryRun]: ...

    async def complete_stale_recovery(self, recovery: RecoveryRun) -> bool: ...

    async def unblocked_queued_runs(self) -> list[RecoveryRun]: ...

    async def dispatch_recovery_run(
        self,
        recovery: RecoveryRun,
        credential_lease_key: str,
    ) -> None: ...

    async def dispatch_next_after_terminal(
        self,
        run_id,
        credential_lease_key: str,
        trace_context: TraceContext,
    ) -> None: ...


class SchedulerCredentials(Protocol):
    def key_for(self, principal: Principal) -> CredentialLeaseKey: ...


class WorkerScheduler:
    def __init__(
        self,
        runs: SchedulableRuns,
        checkpoints: CheckpointRepair,
        credentials: SchedulerCredentials,
        *,
        stale_after_seconds: float,
    ) -> None:
        self._runs = runs
        self._checkpoints = checkpoints
        self._credentials = credentials
        self._stale_after = timedelta(seconds=stale_after_seconds)

    async def recover_stale_runs(self) -> int:
        cutoff = datetime.now(UTC) - self._stale_after
        stale = await self._runs.fail_stale_runs(cutoff)
        recovered = 0
        for recovery in stale:
            try:
                await self._checkpoints.repair_cancelled_run(recovery.session_id)
            except Exception:
                continue
            if not await self._runs.complete_stale_recovery(recovery):
                continue
            recovered += 1
            await self._runs.dispatch_next_after_terminal(
                recovery.run_id,
                self._credentials.key_for(recovery.owner).value,
                TraceContext(request_id="ai-stale-recovery"),
            )
        return recovered

    async def dispatch_unblocked_sessions(self) -> int:
        queued = await self._runs.unblocked_queued_runs()
        for recovery in queued:
            await self._runs.dispatch_recovery_run(
                recovery,
                self._credentials.key_for(recovery.owner).value,
            )
        return len(queued)
