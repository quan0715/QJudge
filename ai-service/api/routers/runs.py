"""Owner-scoped run commands and byte-stable persisted event streams."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse

from api.dependencies import (
    current_bearer_token,
    current_principal,
    get_active_run_reader,
    get_event_reader,
    get_run_service,
    get_sse_poll_seconds,
)
from api.errors import ERROR_RESPONSES
from api.schemas import (
    AnswerRunRequest,
    ApproveRunRequest,
    RunListResponse,
    RunResponse,
    StartRunRequest,
)
from domain.models import Principal, Run, RunStatus, StreamEvent

router = APIRouter(prefix="/v1", tags=["runs"], responses=ERROR_RESPONSES)

_CLOSING_EVENT_TYPES = frozenset(
    {
        "run_completed",
        "run_failed",
        "run_cancelled",
        "awaiting_approval",
        "awaiting_user_answer",
    }
)
_CLOSED_STREAM_STATUSES = frozenset(
    {
        RunStatus.AWAITING_APPROVAL,
        RunStatus.AWAITING_USER_ANSWER,
        RunStatus.COMPLETED,
        RunStatus.FAILED,
        RunStatus.CANCELLED,
    }
)


def encode_sse(event: StreamEvent) -> bytes:
    payload = json.dumps(
        event.payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return (
        f"id: {event.sequence}\nevent: {event.event_type}\ndata: {payload}\n\n"
    ).encode("utf-8")


async def persisted_events(
    principal: Principal,
    run_id: UUID,
    after: int,
    reader: Any,
    *,
    poll_seconds: float,
    initial_run: Run | None = None,
) -> AsyncIterator[bytes]:
    run = initial_run or await reader.get_run(principal, run_id)
    cursor = after
    while True:
        batch = await reader.list_after(principal, run_id, cursor)
        for event in batch:
            cursor = event.sequence
            yield encode_sse(event)
            if event.event_type in _CLOSING_EVENT_TYPES:
                return

        run = await reader.get_run(principal, run_id)
        if run.status in _CLOSED_STREAM_STATUSES and not batch:
            return
        yield b": heartbeat\n\n"
        await asyncio.sleep(poll_seconds)


@router.get("/runs", response_model=RunListResponse)
async def list_active_runs(
    principal: Annotated[Principal, Depends(current_principal)],
    reader: Annotated[Any, Depends(get_active_run_reader)],
    status_filter: Annotated[str, Query(alias="status", pattern="^active$")] = "active",
) -> RunListResponse:
    del status_filter
    runs = await reader.list_for_owner(principal)
    results = [RunResponse.from_domain(run) for run in runs]
    return RunListResponse(count=len(results), results=results)


@router.post(
    "/sessions/{session_id}/runs",
    response_model=RunResponse,
    status_code=202,
)
async def start_run(
    session_id: UUID,
    body: StartRunRequest,
    principal: Annotated[Principal, Depends(current_principal)],
    token: Annotated[str, Depends(current_bearer_token)],
    service: Annotated[Any, Depends(get_run_service)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=1, max_length=255),
    ],
) -> RunResponse:
    run = await service.start(
        principal,
        session_id,
        body.message,
        body.model_id,
        idempotency_key,
        token,
    )
    return RunResponse.from_domain(run)


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_run_service)],
) -> RunResponse:
    return RunResponse.from_domain(await service.get(principal, run_id))


@router.get("/runs/{run_id}/events")
async def stream_run_events(
    run_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    reader: Annotated[Any, Depends(get_event_reader)],
    poll_seconds: Annotated[float, Depends(get_sse_poll_seconds)],
    after: Annotated[int | None, Query(ge=0)] = None,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    cursor = after
    if cursor is None:
        try:
            cursor = max(0, int(last_event_id or "0"))
        except ValueError:
            cursor = 0
    owned_run = await reader.get_run(principal, run_id)
    return StreamingResponse(
        persisted_events(
            principal,
            run_id,
            cursor,
            reader,
            poll_seconds=poll_seconds,
            initial_run=owned_run,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/runs/{run_id}/cancel", response_model=RunResponse)
async def cancel_run(
    run_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_run_service)],
) -> RunResponse:
    return RunResponse.from_domain(await service.cancel(principal, run_id))


@router.post("/runs/{run_id}/approve", response_model=RunResponse)
async def approve_run(
    run_id: UUID,
    body: ApproveRunRequest,
    principal: Annotated[Principal, Depends(current_principal)],
    token: Annotated[str, Depends(current_bearer_token)],
    service: Annotated[Any, Depends(get_run_service)],
) -> RunResponse:
    return RunResponse.from_domain(
        await service.approve(principal, run_id, body.decision, token)
    )


@router.post("/runs/{run_id}/answer", response_model=RunResponse)
async def answer_run(
    run_id: UUID,
    body: AnswerRunRequest,
    principal: Annotated[Principal, Depends(current_principal)],
    token: Annotated[str, Depends(current_bearer_token)],
    service: Annotated[Any, Depends(get_run_service)],
) -> RunResponse:
    return RunResponse.from_domain(
        await service.answer(principal, run_id, body.answer, token)
    )
