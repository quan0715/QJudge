"""Pure projection of durable agent events onto run and assistant state."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from domain.models import Message, Run, RunStatus, Usage
from domain.run_state import transition_run


@dataclass(frozen=True, slots=True)
class EventProjection:
    run: Run
    assistant: Message | None


_TERMINAL_EVENT_STATUSES = {
    "run_completed": RunStatus.COMPLETED,
    "run_failed": RunStatus.FAILED,
    "run_cancelled": RunStatus.CANCELLED,
}
_PAUSE_EVENT_STATUSES = {
    "awaiting_approval": RunStatus.AWAITING_APPROVAL,
    "awaiting_user_answer": RunStatus.AWAITING_USER_ANSWER,
}
_TODO_TOOL_NAMES = {"write_todos", "update_todos"}


def _with_metadata(message: Message | None, metadata: dict[str, Any]) -> Message | None:
    return None if message is None else replace(message, metadata=metadata)


def _assistant_metadata(message: Message | None) -> dict[str, Any]:
    return {} if message is None else dict(message.metadata)


def _todo_items(payload: Any) -> list[Any] | None:
    if not isinstance(payload, dict):
        return None
    items = payload.get("todos", payload.get("todo_items"))
    return list(items) if isinstance(items, list) else None


def _project_todos(metadata: dict[str, Any], payload: Any) -> None:
    items = _todo_items(payload)
    if items is not None:
        metadata["todos"] = items


def _validate_usage_event(event: dict[str, Any]) -> Usage:
    allowed_keys = {"type", "input_tokens", "output_tokens"}
    if set(event) != allowed_keys:
        raise ValueError("usage_report payload must contain only type and token totals")
    input_tokens = event.get("input_tokens")
    output_tokens = event.get("output_tokens")
    if (
        not isinstance(input_tokens, int)
        or isinstance(input_tokens, bool)
        or input_tokens < 0
        or not isinstance(output_tokens, int)
        or isinstance(output_tokens, bool)
        or output_tokens < 0
    ):
        raise ValueError("usage_report token totals must be non-negative integers")
    return Usage(input_tokens=input_tokens, output_tokens=output_tokens)


def reduce_run_event(
    run: Run,
    assistant: Message | None,
    event: dict[str, Any],
) -> EventProjection:
    """Return the state produced by one event without performing I/O."""
    event_type = str(event.get("type", ""))

    if (
        run.status is RunStatus.CANCELLED
        and event_type not in _TERMINAL_EVENT_STATUSES
    ):
        return EventProjection(run=run, assistant=assistant)

    projected_run = run
    projected_assistant = assistant
    metadata = _assistant_metadata(assistant)

    if event_type == "agent_message_delta":
        content = event.get("content")
        if assistant is not None and isinstance(content, str) and content:
            projected_assistant = replace(assistant, content=assistant.content + content)

    elif event_type == "thinking_delta":
        content = event.get("content")
        if isinstance(content, str) and content:
            metadata["thinking"] = f"{metadata.get('thinking', '')}{content}"
            projected_assistant = _with_metadata(assistant, metadata)

    elif event_type == "tool_call_started":
        metadata["current_tool"] = {
            "tool_name": event.get("tool_name"),
            "tool_call_id": event.get("tool_call_id"),
            "input": event.get("input_data"),
        }
        if event.get("tool_name") in _TODO_TOOL_NAMES:
            _project_todos(metadata, event.get("input_data"))
        projected_assistant = _with_metadata(assistant, metadata)

    elif event_type == "tool_call_finished":
        current = metadata.pop("current_tool", {})
        tool = dict(current) if isinstance(current, dict) else {}
        if event.get("tool_name") is not None:
            tool["tool_name"] = event.get("tool_name")
        tool.update(
            {
                "tool_call_id": event.get("tool_call_id") or tool.get("tool_call_id"),
                "result": event.get("result"),
                "is_error": bool(event.get("is_error", False)),
            }
        )
        tools_executed = metadata.get("tools_executed")
        metadata["tools_executed"] = [
            *(tools_executed if isinstance(tools_executed, list) else []),
            tool,
        ]
        if tool.get("tool_name") in _TODO_TOOL_NAMES:
            _project_todos(metadata, tool.get("input"))
            _project_todos(metadata, event.get("result"))
        if tool.get("tool_name") == "suggest_next_actions":
            result = event.get("result")
            if isinstance(result, dict) and isinstance(
                result.get("next_turn_options"), list
            ):
                metadata["next_turn_options"] = list(result["next_turn_options"])
        projected_assistant = _with_metadata(assistant, metadata)

    elif event_type == "todo_update":
        _project_todos(metadata, event)
        projected_assistant = _with_metadata(assistant, metadata)

    elif event_type == "verification_report":
        report = {key: value for key, value in event.items() if key != "type"}
        reports = metadata.get("verification_reports")
        metadata["verification_reports"] = [
            *(reports if isinstance(reports, list) else []),
            report,
        ]
        projected_assistant = _with_metadata(assistant, metadata)

    elif event_type == "usage_report":
        usage = _validate_usage_event(event)
        projected_run = replace(run, usage=usage)
        metadata["usage"] = {
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
        }
        projected_assistant = _with_metadata(assistant, metadata)

    elif event_type == "awaiting_approval":
        pause_payload = {
            "action_requests": list(event.get("action_requests", [])),
            "review_configs": list(event.get("review_configs", [])),
        }
        projected_run = replace(
            transition_run(run, _PAUSE_EVENT_STATUSES[event_type]),
            pause_payload=pause_payload,
        )
        metadata["approval_payload"] = pause_payload
        projected_assistant = _with_metadata(assistant, metadata)

    elif event_type == "awaiting_user_answer":
        pause_payload = {
            "question": str(event.get("question", "")),
            "options": list(event.get("options", [])),
            "input_type": str(event.get("input_type", "text")),
        }
        projected_run = replace(
            transition_run(run, _PAUSE_EVENT_STATUSES[event_type]),
            pause_payload=pause_payload,
        )
        metadata["question_payload"] = pause_payload
        projected_assistant = _with_metadata(assistant, metadata)

    elif event_type in _TERMINAL_EVENT_STATUSES:
        projected_run = replace(
            transition_run(run, _TERMINAL_EVENT_STATUSES[event_type]),
            pause_payload={},
            error_code=(
                str(event.get("error_code")) if event.get("error_code") else None
            ),
            error_message=(
                str(event.get("message")) if event.get("message") else None
            ),
            cancel_requested=(event_type == "run_cancelled" or run.cancel_requested),
        )
        if event_type == "run_completed" and isinstance(
            event.get("next_turn_options"), list
        ):
            metadata["next_turn_options"] = list(event["next_turn_options"])
            projected_assistant = _with_metadata(assistant, metadata)

    return EventProjection(run=projected_run, assistant=projected_assistant)
