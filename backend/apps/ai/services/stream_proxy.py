"""Helpers for AI stream proxy flows."""

import logging

from django.conf import settings

from ..models import AIExecutionLog, AISession

logger = logging.getLogger(__name__)


def build_ai_service_headers() -> dict[str, str]:
    """Build required auth headers for ai-service calls."""
    token = getattr(settings, "AI_SERVICE_INTERNAL_TOKEN", "").strip()
    if not token:
        raise RuntimeError("AI_SERVICE_INTERNAL_TOKEN is not configured")
    return {"X-AI-Internal-Token": token}


def ai_service_base_url() -> str:
    return getattr(settings, "AI_SERVICE_URL", "http://ai-service:8001").rstrip("/")


def create_execution_log(user, session, user_message):
    """Create execution log for a stream request."""
    log_user = user if user and user.is_authenticated else None
    return AIExecutionLog.objects.create(
        user=log_user,
        session=session,
        user_message=user_message,
        raw_log={},
    )


def complete_execution_log(log, ai_response, raw_log=None, metadata=None):
    """Finalize execution log."""
    log.ai_response = ai_response
    if raw_log:
        log.raw_log = raw_log
    if metadata:
        log.metadata = metadata
    log.save()


