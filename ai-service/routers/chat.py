"""Chat API router."""

import logging
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from models.schemas import ChatRequest, MessageRole, StreamEvent
from services.claude_service import get_claude_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Default system prompt for chat - 簡化版本以避免 Claude Code CLI 相容性問題
DEFAULT_SYSTEM_PROMPT = """You are a helpful programming tutor assistant for QJudge Online Judge.

Help students and teachers with programming questions, algorithms, and data structures.
Use Traditional Chinese for responses.
Keep explanations clear and concise."""


def load_skill_prompt(skill_name: str) -> str:
    """載入 skill 的 system prompt。

    Args:
        skill_name: Skill 的名稱 (目錄名稱)

    Returns:
        Skill 的 SKILL.md 內容

    Raises:
        HTTPException: 如果 skill 不存在
    """
    # Skills 現在位於 agent/.claude/skills/ 目錄下
    import os
    current_dir = Path(__file__).parent.parent  # /app or ./ai-service
    skill_file = current_dir / "agent" / ".claude" / "skills" / skill_name / "SKILL.md"

    if not skill_file.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Skill not found: {skill_name} (expected at {skill_file})",
        )
    try:
        return skill_file.read_text(encoding="utf-8")
    except Exception as e:
        logger.error(f"Error loading skill {skill_name}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error loading skill: {str(e)}",
        )


async def generate_sse_events(
    request: ChatRequest,
) -> AsyncGenerator[dict, None]:
    """Generate SSE events for streaming response.

    Args:
        request: Chat request

    Yields:
        Dictionary events to be sent as SSE data
    """
    claude = get_claude_service()

    # 1. 決定 system prompt
    system_prompt = request.system_prompt or DEFAULT_SYSTEM_PROMPT

    # 2. 如果指定了 skill，載入它的 prompt
    if request.skill:
        skill_prompt = load_skill_prompt(request.skill)
        system_prompt = f"{system_prompt}\n\n--- SKILL INSTRUCTIONS ---\n{skill_prompt}"

    # 3. 呼叫 Claude Service
    try:
        async for event in claude.chat_stream(
            conversation=request.conversation,
            system_prompt=system_prompt,
            session_id=request.session_id,
        ):
            # 直接轉成 SSE 格式
            stream_event = StreamEvent(**event)
            yield {"data": stream_event.model_dump_json()}

    except Exception as e:
        logger.exception(f"Streaming error: {e}")
        error_event = StreamEvent(type="error", content=str(e))
        yield {"data": error_event.model_dump_json()}


@router.post("/stream")
async def chat_stream(request: ChatRequest) -> EventSourceResponse:
    """Process a chat request with streaming response (SSE).

    This endpoint streams the response as Server-Sent Events,
    allowing real-time display of AI responses.

    Event types:
    - delta: Text content (streaming)
    - session: Session ID information
    - done: Completion signal
    - error: Error message

    Args:
        request: Chat request with conversation history

    Returns:
        EventSourceResponse with SSE events
    """
    # Validate skill if specified
    if request.skill:
        try:
            load_skill_prompt(request.skill)
        except HTTPException:
            raise

    return EventSourceResponse(generate_sse_events(request))
