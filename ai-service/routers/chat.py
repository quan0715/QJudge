"""Chat API router (v2 — DeepAgent)."""

import hmac
import json
import logging
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from config import get_settings
from models.schemas import ChatRequest, ResumeRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def validate_internal_auth(request: Request) -> None:
    """Ensure request comes from trusted backend caller."""
    expected = get_settings().ai_internal_token.strip()
    provided = request.headers.get("X-AI-Internal-Token", "")

    if not expected:
        raise HTTPException(status_code=500, detail="AI internal auth is not configured")
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _skills_root() -> Path:
    """DeepAgents skills root directory (configurable via settings.skills_dir)."""
    base_dir = Path(__file__).resolve().parent.parent
    configured = Path(get_settings().skills_dir)
    if configured.is_absolute():
        return configured
    return (base_dir / configured).resolve()


def list_available_skill_names() -> set[str]:
    """List available skill directory names under ai-service/skills."""
    root = _skills_root()
    if not root.exists() or not root.is_dir():
        return set()

    names: set[str] = set()
    for child in root.iterdir():
        if child.is_dir() and (child / "SKILL.md").exists():
            names.add(child.name)
    return names


def validate_skill_exists(skill_name: str) -> None:
    """Validate that a requested skill exists in DeepAgents skill sources."""
    available = list_available_skill_names()
    if skill_name not in available:
        available_list = ", ".join(sorted(available)) if available else "(none)"
        raise HTTPException(
            status_code=400,
            detail=f"Skill not found: {skill_name}. Available skills: {available_list}",
        )


async def generate_sse_events(
    request: ChatRequest,
    app_request: Request,
) -> AsyncGenerator[dict, None]:
    """Generate SSE events by running the DeepAgent."""
    runner = app_request.app.state.deepagent_runner

    # Build optional system prompt override
    system_prompt = request.system_prompt

    # Pass requested skill as a routing hint in user message.
    user_content = request.content
    if request.skill:
        user_content = (
            f"請優先使用技能 `{request.skill}`（若任務匹配）。\n\n"
            f"{request.content}"
        )

    # Build messages from conversation + current content
    messages = []
    for msg in request.conversation:
        messages.append({"role": msg.role.value, "content": msg.content})
    messages.append({"role": "user", "content": user_content})

    # Determine API key (override takes priority, never logged)
    api_key = request.api_key_override  # None falls back to env var in ModelFactory

    try:
        async for sse_dict in runner.run_stream(
            thread_id=request.thread_id,
            messages=messages,
            model_id=request.model_id,
            api_key=api_key,
            system_prompt=system_prompt,
            session_id=request.session_id,
            user_id=request.user_id,
        ):
            yield {"data": json.dumps(sse_dict, ensure_ascii=False)}
    except Exception as e:
        logger.exception("Streaming error: %s", e)
        yield {
            "data": json.dumps(
                {
                    "type": "run_failed",
                    "run_id": "",
                    "error_code": "STREAM_ERROR",
                    "message": "Streaming failed",
                }
            )
        }


@router.post("/stream")
async def chat_stream(request: ChatRequest, app_request: Request) -> EventSourceResponse:
    """Process a chat request with streaming SSE response (v2 contract).

    Event types: run_started, agent_message_delta, tool_call_started,
    tool_call_finished, verification_report, approval_required,
    usage_report, run_completed, run_failed.
    """
    validate_internal_auth(app_request)
    if request.skill:
        validate_skill_exists(request.skill)  # validate early

    return EventSourceResponse(generate_sse_events(request, app_request))


async def generate_resume_events(
    request: ResumeRequest,
    app_request: Request,
) -> AsyncGenerator[dict, None]:
    """Generate SSE events by resuming an interrupted DeepAgent."""
    runner = app_request.app.state.deepagent_runner

    try:
        async for sse_dict in runner.resume_stream(
            thread_id=request.thread_id,
            decision=request.decision,
            session_id=request.session_id,
            user_id=request.user_id,
        ):
            yield {"data": json.dumps(sse_dict, ensure_ascii=False)}
    except Exception as e:
        logger.exception("Resume streaming error: %s", e)
        yield {
            "data": json.dumps(
                {
                    "type": "run_failed",
                    "run_id": "",
                    "error_code": "RESUME_ERROR",
                    "message": "Resume failed",
                }
            )
        }


@router.post("/resume")
async def chat_resume(request: ResumeRequest, app_request: Request) -> EventSourceResponse:
    """Resume an interrupted agent with a user decision (approve/reject).

    Streams SSE events for the resumed agent execution.
    """
    validate_internal_auth(app_request)
    return EventSourceResponse(generate_resume_events(request, app_request))
