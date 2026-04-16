"""Chat API router (v2 — DeepAgent)."""

import hmac
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from config import get_settings
from models.schemas import ChatRequest, RequestContext, ResumeRequest

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


async def generate_sse_events(
    request: ChatRequest,
    app_request: Request,
) -> AsyncGenerator[dict, None]:
    """Generate SSE events by running the DeepAgent."""
    runner = app_request.app.state.deepagent_runner

    messages = []
    for msg in request.conversation:
        messages.append({"role": msg.role.value, "content": msg.content})
    messages.append({"role": "user", "content": request.content})

    request_context = RequestContext(
        user_authorization=app_request.headers.get("X-QJudge-User-Authorization"),
    )

    try:
        async for sse_dict in runner.run_stream(
            thread_id=request.thread_id,
            messages=messages,
            model_id=request.model_id,
            system_prompt=request.system_prompt,
            request_context=request_context,
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

    Event types: run_started, agent_message_delta, thinking_delta,
    tool_call_started, tool_call_finished, verification_report,
    usage_report, run_completed, run_failed.
    """
    validate_internal_auth(app_request)
    return EventSourceResponse(generate_sse_events(request, app_request))


async def generate_resume_events(
    request: ResumeRequest,
    app_request: Request,
) -> AsyncGenerator[dict, None]:
    """Generate SSE events by resuming an interrupted DeepAgent."""
    runner = app_request.app.state.deepagent_runner

    request_context = RequestContext(
        user_authorization=app_request.headers.get("X-QJudge-User-Authorization"),
    )

    try:
        async for sse_dict in runner.resume_stream(
            thread_id=request.thread_id,
            decision=request.decision,
            request_context=request_context,
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


@router.delete("/thread/{thread_id}")
async def delete_thread(thread_id: str, app_request: Request) -> dict:
    """Delete all LangGraph checkpoint state for a thread.

    Used when a session becomes unrecoverable (e.g. dangling tool_calls
    that can't be repaired). Clears the checkpoint so the next message
    starts from a clean state on the same session ID.
    """
    validate_internal_auth(app_request)
    runner = app_request.app.state.deepagent_runner
    try:
        await runner.delete_thread(thread_id)
        return {"deleted": True, "thread_id": thread_id}
    except Exception as e:
        logger.exception("Failed to delete thread %s: %s", thread_id, e)
        return {"deleted": False, "thread_id": thread_id, "error": str(e)}


@router.post("/resume")
async def chat_resume(request: ResumeRequest, app_request: Request) -> EventSourceResponse:
    """Resume an interrupted agent with a user decision (approve/reject).

    Streams SSE events for the resumed agent execution.
    """
    validate_internal_auth(app_request)
    return EventSourceResponse(generate_resume_events(request, app_request))
