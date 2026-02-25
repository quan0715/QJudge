"""Helpers for AI stream proxy flows."""

import asyncio
import logging

from django.conf import settings

from ..ai_client import get_ai_client
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


async def generate_session_title(user_message: str, user_api_key: str) -> str:
    """Generate concise session title via AI service."""
    client = get_ai_client()

    title_prompt = """根據以下用戶訊息，生成一個簡短的對話標題（5-15 個字）。
標題應該簡潔描述對話主題，不需要引號或標點符號。
只回覆標題本身，不要有任何其他文字。

用戶訊息：
"""
    try:
        result = await client.chat(
            conversation=[{"role": "user", "content": title_prompt + user_message[:500]}],
            max_tokens=50,
            model_override="haiku",
            user_api_key=user_api_key,
        )
        title = result.content.strip().strip('"\'')
        if len(title) > 50:
            title = title[:47] + "..."
        return title
    except Exception as e:
        logger.warning("Failed to generate session title: %s", e)
        return user_message[:30] + "..." if len(user_message) > 30 else user_message


def update_session_title_async(session, user_message: str, user_api_key: str):
    """Update session title in background thread."""
    import django

    django.db.connections.close_all()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        title = loop.run_until_complete(generate_session_title(user_message, user_api_key))
    finally:
        loop.close()

    try:
        db_session = AISession.objects.get(pk=session.pk)
        db_session.context = db_session.context or {}
        db_session.context["title"] = title
        db_session.save(update_fields=["context", "updated_at"])
        logger.info("Session %s title updated to: %s", session.pk, title)
    except Exception as e:
        logger.error("Failed to update session title: %s", e)
