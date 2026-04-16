"""Runtime helpers for AI session streaming flows."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator, Callable
from typing import Any

import httpx
from django.http import StreamingHttpResponse
from django.utils import timezone

from ..models import AIMessage, AISession
from .stream_proxy import (
    ai_service_base_url,
    build_ai_service_headers,
    complete_execution_log,
    create_execution_log,
)

logger = logging.getLogger(__name__)


def build_sse_response(generator: AsyncGenerator[str, None]) -> StreamingHttpResponse:
    """Wrap an async generator in a standard SSE response."""
    response = StreamingHttpResponse(generator, content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


class BaseAIStreamRuntime:
    """Shared mechanics for proxying ai-service SSE streams."""

    endpoint = ""

    def _error_event(self, message: str) -> str:
        return f"data: {json.dumps({'type': 'error', 'content': message})}\n\n"

    async def _proxy_stream(
        self,
        *,
        payload: dict[str, Any],
        on_event: Callable[[dict[str, Any]], None],
        error_prefix: str,
    ) -> AsyncGenerator[str, None]:
        try:
            ai_headers = build_ai_service_headers(getattr(self, "user", None))
        except RuntimeError as exc:
            self.stream_error = str(exc)
            logger.error(self.stream_error)
            yield self._error_event(self.stream_error)
            return

        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    f"{ai_service_base_url()}{self.endpoint}",
                    json=payload,
                    headers=ai_headers,
                    timeout=httpx.Timeout(10.0, read=120.0),
                ) as response:
                    if response.status_code != 200:
                        await response.aread()
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

                    buffer = ""
                    async for chunk in response.aiter_bytes():
                        buffer += chunk.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                            if line.startswith("data: "):
                                try:
                                    event = json.loads(line[6:])
                                    on_event(event)
                                except json.JSONDecodeError:
                                    pass
                                yield f"{line}\n\n"
                            else:
                                yield f"{line}\n"
                    # Flush remaining buffer
                    if buffer.strip():
                        line = buffer.strip()
                        if line.startswith("data: "):
                            try:
                                event = json.loads(line[6:])
                                on_event(event)
                            except json.JSONDecodeError:
                                pass
                            yield f"{line}\n\n"
                        else:
                            yield f"{line}\n"
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
    ) -> None:
        self.user = user
        self.backend_session_id = backend_session_id
        self.session = session
        self.content = content
        self.validated_data = validated_data

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
        }

        model_id = self.validated_data.get("model_id")
        if model_id:
            payload["model_id"] = model_id

        if self.session:
            payload["thread_id"] = self.session.session_id

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
        input_tokens = self.collected_usage.get("input_tokens", 0) if self.collected_usage else 0
        output_tokens = self.collected_usage.get("output_tokens", 0) if self.collected_usage else 0
        cost_cents = self.collected_usage.get("cost_cents", 0) if self.collected_usage else 0

        self.log.input_tokens = input_tokens
        self.log.output_tokens = output_tokens
        self.log.cost_cents = cost_cents
        self.log.save()

        from apps.ai.models import UserAICredit
        from django.db.models import F

        UserAICredit.objects.get_or_create(user=self.user)
        UserAICredit.objects.filter(user=self.user).update(
            total_input_tokens=F("total_input_tokens") + (input_tokens or 0),
            total_output_tokens=F("total_output_tokens") + (output_tokens or 0),
            total_requests=F("total_requests") + 1,
            total_cost_cents=F("total_cost_cents") + (cost_cents or 0),
        )

    async def generate(self) -> AsyncGenerator[str, None]:
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

        async for chunk in self._proxy_stream(
            payload=self._build_payload(),
            on_event=self._handle_event,
            error_prefix="Error proxying to ai-service",
        ):
            yield chunk

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
    ) -> None:
        self.user = user
        self.session = session
        self.decision = decision

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

        if self.collected_usage:
            from apps.ai.models import UserAICredit
            from django.db.models import F

            input_tokens = self.collected_usage.get("input_tokens") or 0
            output_tokens = self.collected_usage.get("output_tokens") or 0
            cost_cents = self.collected_usage.get("cost_cents") or 0

            UserAICredit.objects.get_or_create(user=self.user)
            UserAICredit.objects.filter(user=self.user).update(
                total_input_tokens=F("total_input_tokens") + input_tokens,
                total_output_tokens=F("total_output_tokens") + output_tokens,
                total_requests=F("total_requests") + 1,
                total_cost_cents=F("total_cost_cents") + cost_cents,
            )

    async def generate(self) -> AsyncGenerator[str, None]:
        async for chunk in self._proxy_stream(
            payload=self._build_payload(),
            on_event=self._handle_event,
            error_prefix="Error proxying resume to ai-service",
        ):
            yield chunk
        self._persist_response()
