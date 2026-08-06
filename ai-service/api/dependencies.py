"""Request-scoped authentication and application-service dependencies."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from domain.models import Principal
from infrastructure.oauth.jwt_verifier import AuthError, JwtVerifier

bearer = HTTPBearer(auto_error=False)


def _state(request: Request, name: str) -> Any:
    try:
        return getattr(request.app.state, name)
    except AttributeError as exc:
        raise RuntimeError(f"API dependency {name} is not configured") from exc


def get_verifier(request: Request) -> JwtVerifier:
    return _state(request, "jwt_verifier")


def current_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthError("AI_AUTH_INVALID", "Invalid access token")
    return credentials.credentials


def current_principal(
    token: str = Depends(current_bearer_token),
    verifier: JwtVerifier = Depends(get_verifier),
) -> Principal:
    return verifier.verify(
        token,
        audience="ai-service",
        required_scopes=frozenset({"ai:chat"}),
    )


def get_session_service(request: Request) -> Any:
    return _state(request, "session_service")


def get_run_service(request: Request) -> Any:
    return _state(request, "run_service")


def get_event_reader(request: Request) -> Any:
    return _state(request, "event_reader")


def get_active_run_reader(request: Request) -> Any:
    return _state(request, "active_run_reader")


def get_artifact_service(request: Request) -> Any:
    return _state(request, "artifact_service")


def get_usage_service(request: Request) -> Any:
    return _state(request, "usage_service")


def get_readiness_probe(request: Request) -> Any:
    return _state(request, "readiness_probe")


def get_sse_poll_seconds(request: Request) -> float:
    return float(getattr(request.app.state, "sse_poll_seconds", 0.5))
