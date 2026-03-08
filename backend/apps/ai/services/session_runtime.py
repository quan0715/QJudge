"""Runtime helpers for AI session streaming flows."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable, Generator
from typing import Any

import httpx
from django.http import StreamingHttpResponse
from django.utils import timezone

from ..ai_client import get_ai_client
from ..models import AIMessage, AISession
from .stream_proxy import (
    ai_service_base_url,
    build_ai_service_headers,
    complete_execution_log,
    create_execution_log,
)

logger = logging.getLogger(__name__)


def get_active_user_api_key(user) -> str | None:
    """Return the user's active API key, if one is configured."""
    try:
        user_api_key = user.api_key
    except Exception:
        return None

    if not user_api_key.is_active:
        return None
    return user_api_key.get_key()


def submit_pending_answer(request_id: str, answers: dict[str, str]) -> dict[str, Any]:
    """Submit answers for a pending user-input request."""
    submit_coro = get_ai_client().submit_user_answer
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        new_loop = asyncio.new_event_loop()
        try:
            return new_loop.run_until_complete(submit_coro(request_id, answers))
        finally:
            new_loop.close()

    return asyncio.run(submit_coro(request_id, answers))


def build_sse_response(generator: Generator[str, None, None]) -> StreamingHttpResponse:
    """Wrap a generator in a standard SSE response."""
    response = StreamingHttpResponse(generator, content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


class BaseAIStreamRuntime:
    """Shared mechanics for proxying ai-service SSE streams."""

    endpoint = ""

    def _error_event(self, message: str) -> str:
        return f"data: {json.dumps({'type': 'error', 'content': message})}\n\n"

    def _proxy_stream(
        self,
        *,
        payload: dict[str, Any],
        on_event: Callable[[dict[str, Any]], None],
        error_prefix: str,
    ) -> Generator[str, None, None]:
        try:
            ai_headers = build_ai_service_headers()
        except RuntimeError as exc:
            self.stream_error = str(exc)
            logger.error(self.stream_error)
            yield self._error_event(self.stream_error)
            return

        try:
            with httpx.stream(
                "POST",
                f"{ai_service_base_url()}{self.endpoint}",
                json=payload,
                headers=ai_headers,
                timeout=120.0,
            ) as response:
                if response.status_code != 200:
                    response.read()
                    error_text = response.text
                    logger.error(
                        "%s: %s - %s",
                        error_prefix,
                        response.status_code,
                        error_text,
                    )
                    self.stream_error = f"ai-service error: {response.status_code}"
                    yield self._error_event(self.stream_error)
                    return

                for line in response.iter_lines():
                    if line.strip():
                        if line.startswith("data: "):
                            try:
                                event = json.loads(line[6:])
                                on_event(event)
                                yield f"{line}\n\n"
                            except json.JSONDecodeError:
                                logger.debug("Failed to parse SSE line: %s", line)
                                yield f"{line}\n\n"
                        else:
                            yield f"{line}\n"
                    else:
                        yield "\n"
        except Exception as exc:
            self.stream_error = str(exc)
            logger.exception("%s: %s", error_prefix, exc)
            yield self._error_event(self.stream_error)


class ChatStreamRuntime(BaseAIStreamRuntime):
    """Owns the chat-stream proxy and persistence flow."""

    endpoint = "/api/chat/stream"

    def __init__(
        self,
        *,
        user,
        backend_session_id: str,
        session: AISession | None,
        content: str,
        validated_data: dict[str, Any],
        skill: str | None,
        user_api_key: str,
    ) -> None:
        self.user = user
        self.backend_session_id = backend_session_id
        self.session = session
        self.content = content
        self.validated_data = validated_data
        self.skill = skill
        self.user_api_key = user_api_key

        self.full_response = ""
        self.stream_error: str | None = None
        self.received_session_id: str | None = None
        self.all_tools_executed: list[dict[str, Any]] = []
        self.collected_usage: dict[str, Any] | None = None
        self.current_tool: dict[str, Any] | None = None
        self.collected_thinking = ""
        self.log = None

    def _build_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "content": self.content,
            "conversation": [],
            "api_key_override": self.user_api_key,
            "user_id": self.user.id,
        }

        model_id = self.validated_data.get("model_id")
        if model_id:
            payload["model_id"] = model_id

        if self.session:
            payload["thread_id"] = self.session.session_id
            payload["session_id"] = self.session.session_id

        if self.skill:
            payload["skill"] = self.skill

        return payload

    def _handle_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")

        if event_type == "run_started" and event.get("thread_id"):
            self.received_session_id = event["thread_id"]

        if event_type == "thinking_delta" and event.get("content"):
            self.collected_thinking += event["content"]

        if event_type == "agent_message_delta" and event.get("content"):
            self.full_response += event["content"]

        if event_type == "tool_call_started":
            self.current_tool = {
                "tool_name": event.get("tool_name"),
                "tool_call_id": event.get("tool_call_id"),
                "input": event.get("input_data"),
            }

        if event_type == "tool_call_finished" and self.current_tool:
            self.current_tool["result"] = event.get("result")
            self.current_tool["is_error"] = event.get("is_error", False)
            self.all_tools_executed.append(self.current_tool)
            self.current_tool = None

        if event_type == "usage_report":
            self.collected_usage = {
                "input_tokens": event.get("input_tokens"),
                "output_tokens": event.get("output_tokens"),
                "cost_cents": event.get("cost_cents"),
                "model_used": event.get("model_used"),
            }

    def _ensure_log(self) -> None:
        if not self.session or self.log:
            return

        self.log = create_execution_log(
            user=self.user,
            session=self.session,
            user_message=self.content,
        )

    def _persist_session(self) -> None:
        if not self.received_session_id:
            return

        if not self.session:
            self.session = AISession.objects.create(
                session_id=self.received_session_id,
                user=self.user,
                context={},
            )
            AIMessage.objects.create(
                session=self.session,
                role=AIMessage.Role.USER,
                content=self.content,
                message_type=AIMessage.MessageType.TEXT,
            )
            self._ensure_log()
            return

        if self.session.session_id != self.received_session_id:
            logger.warning(
                "Session ID mismatch: expected %s, got %s",
                self.session.session_id,
                self.received_session_id,
            )
        self.session.updated_at = timezone.now()
        self.session.save(update_fields=["updated_at"])

    def _persist_response(self) -> None:
        if not self.session or not self.full_response:
            return

        message_metadata: dict[str, Any] = {}
        if self.collected_thinking:
            message_metadata["thinking"] = self.collected_thinking
        if self.all_tools_executed:
            message_metadata["tools_executed"] = self.all_tools_executed
        if self.collected_usage:
            message_metadata["usage"] = self.collected_usage

        AIMessage.objects.create(
            session=self.session,
            role=AIMessage.Role.ASSISTANT,
            content=self.full_response,
            message_type=AIMessage.MessageType.TEXT,
            metadata=message_metadata,
        )

    def _complete_log(self) -> None:
        if not self.log:
            return

        log_metadata: dict[str, Any] = {
            "error": self.stream_error,
            "session_id": self.received_session_id,
        }
        if self.all_tools_executed:
            log_metadata["tools_executed"] = self.all_tools_executed
        if self.collected_usage:
            log_metadata["usage"] = self.collected_usage

        complete_execution_log(
            log=self.log,
            ai_response=self.full_response or None,
            raw_log=log_metadata,
            metadata=log_metadata,
        )
        self.log.input_tokens = self.collected_usage.get("input_tokens", 0) if self.collected_usage else 0
        self.log.output_tokens = self.collected_usage.get("output_tokens", 0) if self.collected_usage else 0
        self.log.cost_cents = self.collected_usage.get("cost_cents", 0) if self.collected_usage else 0
        self.log.save()

    def generate(self) -> Generator[str, None, None]:
        if self.session:
            AIMessage.objects.create(
                session=self.session,
                role=AIMessage.Role.USER,
                content=self.content,
                message_type=AIMessage.MessageType.TEXT,
            )
            self._ensure_log()

        init_event = {
            "type": "init",
            "backend_session_id": self.backend_session_id,
            "is_new_session": self.session is None,
        }
        yield f"data: {json.dumps(init_event)}\n\n"

        yield from self._proxy_stream(
            payload=self._build_payload(),
            on_event=self._handle_event,
            error_prefix="Error proxying to ai-service",
        )

        self._persist_session()
        self._persist_response()
        self._complete_log()


class ResumeStreamRuntime(BaseAIStreamRuntime):
    """Owns the resume-stream proxy and persistence flow."""

    endpoint = "/api/chat/resume"

    def __init__(
        self,
        *,
        user,
        session: AISession,
        decision: str,
        user_api_key: str,
    ) -> None:
        self.user = user
        self.session = session
        self.decision = decision
        self.user_api_key = user_api_key

        self.full_response = ""
        self.collected_usage: dict[str, Any] | None = None
        self.stream_error: str | None = None

    def _handle_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type == "agent_message_delta" and event.get("content"):
            self.full_response += event["content"]

        if event_type == "usage_report":
            self.collected_usage = {
                "input_tokens": event.get("input_tokens"),
                "output_tokens": event.get("output_tokens"),
                "cost_cents": event.get("cost_cents"),
                "model_used": event.get("model_used"),
            }

    def _build_payload(self) -> dict[str, Any]:
        return {
            "thread_id": self.session.session_id,
            "decision": self.decision,
            "session_id": self.session.session_id,
            "user_id": self.user.id,
            "api_key_override": self.user_api_key,
        }

    def _persist_response(self) -> None:
        if self.full_response:
            message_metadata = {}
            if self.collected_usage:
                message_metadata["usage"] = self.collected_usage

            AIMessage.objects.create(
                session=self.session,
                role=AIMessage.Role.ASSISTANT,
                content=self.full_response,
                message_type=AIMessage.MessageType.TEXT,
                metadata=message_metadata,
            )

        self.session.updated_at = timezone.now()
        self.session.save(update_fields=["updated_at"])

    def generate(self) -> Generator[str, None, None]:
        yield from self._proxy_stream(
            payload=self._build_payload(),
            on_event=self._handle_event,
            error_prefix="Error proxying resume to ai-service",
        )
        self._persist_response()
