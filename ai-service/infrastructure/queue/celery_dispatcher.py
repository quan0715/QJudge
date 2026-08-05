"""Celery adapter for authoritative AI run delivery."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from domain.ports import TraceContext


class CeleryApplication(Protocol):
    def send_task(self, name: str, **kwargs: Any) -> Any: ...


class CeleryRunDispatcher:
    def __init__(
        self,
        celery_app: CeleryApplication,
        *,
        task_name: str = "ai.execute_run",
    ) -> None:
        self._celery_app = celery_app
        self._task_name = task_name

    async def dispatch(
        self,
        run_id: UUID,
        credential_lease_key: str | None,
        trace_context: TraceContext,
    ) -> None:
        self._celery_app.send_task(
            self._task_name,
            task_id=str(run_id),
            kwargs={
                "run_id": str(run_id),
                "credential_lease_key": credential_lease_key,
                "trace_context": {
                    "request_id": trace_context.request_id,
                    "traceparent": trace_context.traceparent,
                },
            },
        )
