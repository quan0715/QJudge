"""Owner-scoped session routes."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from api.dependencies import current_principal, get_session_service
from api.errors import ERROR_RESPONSES
from api.schemas import (
    CreateSessionRequest,
    RenameSessionRequest,
    SessionDetailResponse,
    SessionListResponse,
    SessionResponse,
)
from domain.models import Principal

router = APIRouter(prefix="/v1", tags=["sessions"], responses=ERROR_RESPONSES)


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_session_service)],
) -> SessionListResponse:
    sessions = await service.list_sessions(principal)
    results = [SessionResponse.from_domain(session) for session in sessions]
    return SessionListResponse(count=len(results), results=results)


@router.post(
    "/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    body: CreateSessionRequest,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_session_service)],
) -> SessionResponse:
    return SessionResponse.from_domain(
        await service.create_session(principal, body.context)
    )


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_session_service)],
) -> SessionDetailResponse:
    return SessionDetailResponse.from_domain(
        await service.get_session_detail(principal, session_id)
    )


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def rename_session(
    session_id: UUID,
    body: RenameSessionRequest,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_session_service)],
) -> SessionResponse:
    return SessionResponse.from_domain(
        await service.rename_session(principal, session_id, body.title)
    )


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_session(
    session_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_session_service)],
) -> Response:
    await service.delete_session(principal, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/{session_id}/clear", response_model=SessionResponse)
async def clear_session(
    session_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_session_service)],
) -> SessionResponse:
    return SessionResponse.from_domain(
        await service.clear_session(principal, session_id)
    )
