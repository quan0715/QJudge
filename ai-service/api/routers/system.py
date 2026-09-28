"""Process health and authenticated service metadata routes."""

from __future__ import annotations

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from api.dependencies import (
    current_principal,
    get_model_catalog,
    get_readiness_probe,
    get_usage_service,
)
from api.errors import ERROR_RESPONSES, ErrorDetail, ErrorEnvelope, request_id_for
from api.schemas import LiveResponse, ModelInfo, ModelsResponse, ReadyResponse, UsageResponse
from domain.models import Principal

health_router = APIRouter(prefix="/health", tags=["health"])
system_router = APIRouter(prefix="/v1", tags=["system"], responses=ERROR_RESPONSES)


@health_router.get("/live", response_model=LiveResponse)
async def live() -> LiveResponse:
    return LiveResponse()


@health_router.get(
    "/ready",
    response_model=ReadyResponse,
    responses={503: {"model": ErrorEnvelope}},
)
async def ready(
    request: Request,
    probe: Annotated[Any, Depends(get_readiness_probe)],
) -> ReadyResponse | JSONResponse:
    checks = await probe.check()
    healthy = all(value == "ready" for value in checks.values())
    if healthy:
        return ReadyResponse(status="ready", checks=checks)
    return JSONResponse(
        status_code=503,
        content=ErrorEnvelope(
            error=ErrorDetail(
                code="SERVICE_NOT_READY",
                message="AI Service is not ready.",
                retryable=True,
                request_id=request_id_for(request),
            )
        ).model_dump(mode="json"),
    )


@system_router.get("/models", response_model=ModelsResponse)
async def models(
    _principal: Annotated[Principal, Depends(current_principal)],
    catalog: Annotated[Any, Depends(get_model_catalog)],
) -> ModelsResponse:
    available, default_id = await asyncio.to_thread(
        lambda: (catalog.available(), catalog.default_id())
    )
    return ModelsResponse(
        models=[
            ModelInfo(
                model_id=spec.id,
                display_name=spec.display_name,
                description=spec.description,
                is_default=spec.id == default_id,
            )
            for spec in available
        ]
    )


@system_router.get("/usage", response_model=UsageResponse)
async def usage(
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_usage_service)],
) -> UsageResponse:
    return UsageResponse.from_domain(await service.get_usage_summary(principal))
