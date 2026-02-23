"""Chat API router (v2 — DeepAgent)."""

import json
import logging
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from models.schemas import ChatRequest, ResumeRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def load_skill_prompt(skill_name: str) -> str:
    """Load a skill's system prompt from disk.

    Skills are located at agent/.claude/skills/{name}/SKILL.md
    """
    current_dir = Path(__file__).parent.parent
    skill_file = current_dir / "agent" / ".claude" / "skills" / skill_name / "SKILL.md"

    if not skill_file.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Skill not found: {skill_name} (expected at {skill_file})",
        )
    try:
        return skill_file.read_text(encoding="utf-8")
    except Exception as e:
        logger.error("Error loading skill %s: %s", skill_name, e)
        raise HTTPException(status_code=500, detail=f"Error loading skill: {e}")


async def generate_sse_events(
    request: ChatRequest,
    app_request: Request,
) -> AsyncGenerator[dict, None]:
    """Generate SSE events by running the DeepAgent."""
    runner = app_request.app.state.deepagent_runner

    # Build system prompt
    system_prompt = request.system_prompt
    if request.skill:
        skill_prompt = load_skill_prompt(request.skill)
        base = system_prompt or ""
        system_prompt = f"{base}\n\n--- SKILL INSTRUCTIONS ---\n{skill_prompt}" if base else skill_prompt

    # Build messages from conversation + current content
    messages = []
    for msg in request.conversation:
        messages.append({"role": msg.role.value, "content": msg.content})
    messages.append({"role": "user", "content": request.content})

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
        yield {"data": json.dumps({"type": "run_failed", "run_id": "", "error_code": "STREAM_ERROR", "message": str(e)})}


@router.post("/stream")
async def chat_stream(request: ChatRequest, app_request: Request) -> EventSourceResponse:
    """Process a chat request with streaming SSE response (v2 contract).

    Event types: run_started, agent_message_delta, tool_call_started,
    tool_call_finished, verification_report, approval_required,
    usage_report, run_completed, run_failed.
    """
    if request.skill:
        load_skill_prompt(request.skill)  # validate early

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
        yield {"data": json.dumps({"type": "run_failed", "run_id": "", "error_code": "RESUME_ERROR", "message": str(e)})}


@router.post("/resume")
async def chat_resume(request: ResumeRequest, app_request: Request) -> EventSourceResponse:
    """Resume an interrupted agent with a user decision (approve/reject).

    Streams SSE events for the resumed agent execution.
    """
    return EventSourceResponse(generate_resume_events(request, app_request))
