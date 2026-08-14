"""Canonical route groups."""

from .artifacts import router as artifacts_router
from .runs import router as runs_router
from .sessions import router as sessions_router
from .system import health_router, system_router

__all__ = [
    "artifacts_router",
    "health_router",
    "runs_router",
    "sessions_router",
    "system_router",
]
