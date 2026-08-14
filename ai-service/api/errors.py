"""Stable public errors that never expose internal exception details."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from application.artifacts import ArtifactNotFound, InvalidArtifact
from application.run_service import (
    InvalidRunState,
    RunCancellationRequested,
    RunNotFound,
)
from application.run_service import (
    SessionNotFound as RunSessionNotFound,
)
from application.session_service import SessionNotFound
from domain.ports import McpReadinessError
from infrastructure.artifacts.s3_artifact_store import ArtifactStorageError
from infrastructure.oauth.jwt_verifier import AuthError

logger = logging.getLogger(__name__)


class ErrorDetail(BaseModel):
    code: str
    message: str
    retryable: bool
    request_id: str


class ErrorEnvelope(BaseModel):
    error: ErrorDetail


def request_id_for(request: Request) -> str:
    return str(getattr(request.state, "request_id", "unknown"))


def error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    retryable: bool = False,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    envelope = ErrorEnvelope(
        error=ErrorDetail(
            code=code,
            message=message,
            retryable=retryable,
            request_id=request_id_for(request),
        )
    )
    correlation_headers = {"X-Request-ID": request_id_for(request)}
    traceparent = getattr(request.state, "traceparent", None)
    if traceparent:
        correlation_headers["traceparent"] = str(traceparent)
    if headers:
        correlation_headers.update(headers)
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json"),
        headers=correlation_headers,
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AuthError)
    async def auth_error(request: Request, exc: AuthError) -> JSONResponse:
        denied = exc.code == "AI_SCOPE_DENIED"
        return error_response(
            request,
            status_code=403 if denied else 401,
            code=exc.code,
            message=(
                "The access token does not grant AI chat access."
                if denied
                else "Authentication is required."
            ),
            headers=None if denied else {"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(McpReadinessError)
    async def mcp_error(request: Request, exc: McpReadinessError) -> JSONResponse:
        messages = {
            "MCP_AUTH_FAILED": "AI tool authorization is temporarily unavailable.",
            "MCP_UNAVAILABLE": "AI tools are temporarily unavailable.",
            "MCP_PROTOCOL_ERROR": "AI tools could not be initialized.",
            "MCP_TOOL_DISCOVERY_FAILED": "AI tool discovery failed.",
        }
        return error_response(
            request,
            status_code=503,
            code=exc.code,
            message=messages.get(exc.code, "AI tools are temporarily unavailable."),
            retryable=bool(exc.retryable),
        )

    @app.exception_handler(SessionNotFound)
    @app.exception_handler(RunSessionNotFound)
    async def session_not_found(request: Request, _exc: Exception) -> JSONResponse:
        return error_response(
            request,
            status_code=404,
            code="SESSION_NOT_FOUND",
            message="Session was not found.",
        )

    @app.exception_handler(RunNotFound)
    async def run_not_found(request: Request, _exc: RunNotFound) -> JSONResponse:
        return error_response(
            request,
            status_code=404,
            code="RUN_NOT_FOUND",
            message="Run was not found.",
        )

    @app.exception_handler(ArtifactNotFound)
    async def artifact_not_found(
        request: Request, _exc: ArtifactNotFound
    ) -> JSONResponse:
        return error_response(
            request,
            status_code=404,
            code="ARTIFACT_NOT_FOUND",
            message="Artifact was not found.",
        )

    @app.exception_handler(InvalidRunState)
    @app.exception_handler(RunCancellationRequested)
    async def run_conflict(request: Request, _exc: Exception) -> JSONResponse:
        return error_response(
            request,
            status_code=409,
            code="RUN_STATE_CONFLICT",
            message="Run state does not allow this operation.",
        )

    @app.exception_handler(InvalidArtifact)
    async def invalid_artifact(request: Request, _exc: InvalidArtifact) -> JSONResponse:
        return error_response(
            request,
            status_code=422,
            code="INVALID_ARTIFACT",
            message="Artifact input is invalid.",
        )

    @app.exception_handler(ArtifactStorageError)
    async def artifact_storage_error(
        request: Request, _exc: ArtifactStorageError
    ) -> JSONResponse:
        return error_response(
            request,
            status_code=503,
            code="ARTIFACT_STORAGE_UNAVAILABLE",
            message="Artifact storage is temporarily unavailable.",
            retryable=True,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(
        request: Request, _exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            request,
            status_code=422,
            code="VALIDATION_ERROR",
            message="Request validation failed.",
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        messages = {
            404: ("HTTP_NOT_FOUND", "Resource was not found."),
            405: ("METHOD_NOT_ALLOWED", "Method is not allowed."),
        }
        code, message = messages.get(
            exc.status_code,
            ("HTTP_ERROR", "The request could not be completed."),
        )
        return error_response(
            request,
            status_code=exc.status_code,
            code=code,
            message=message,
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "Unhandled API error",
            extra={"request_id": request_id_for(request)},
            exc_info=exc,
        )
        return error_response(
            request,
            status_code=500,
            code="INTERNAL_ERROR",
            message="An internal error occurred.",
            retryable=False,
        )


ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorEnvelope},
    403: {"model": ErrorEnvelope},
    404: {"model": ErrorEnvelope},
    409: {"model": ErrorEnvelope},
    422: {"model": ErrorEnvelope},
    503: {"model": ErrorEnvelope},
}
