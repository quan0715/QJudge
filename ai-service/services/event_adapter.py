"""Two-layer event adapter.

Layer 1: LangGraph raw streaming events  ->  Internal event dataclasses
Layer 2: Internal event dataclasses       ->  SSE-serialisable dicts
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any, Union

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal Event Model (dataclasses)
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class RunStarted:
    run_id: str
    thread_id: str


@dataclass(slots=True)
class AgentMessageDelta:
    content: str


@dataclass(slots=True)
class ThinkingDelta:
    content: str


@dataclass(slots=True)
class VerificationReport:
    iteration: int
    passed: bool
    issues: list[str]
    summary: str


@dataclass(slots=True)
class ToolCallStarted:
    tool_name: str
    tool_call_id: str
    input_data: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ToolCallFinished:
    tool_call_id: str
    result: Any = None
    is_error: bool = False


@dataclass(slots=True)
class ApprovalRequired:
    action_id: str
    action_type: str
    preview: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class UsageReport:
    input_tokens: int
    output_tokens: int
    cost_cents: int
    model_used: str


@dataclass(slots=True)
class RunCompleted:
    run_id: str


@dataclass(slots=True)
class RunFailed:
    run_id: str
    error_code: str
    message: str


InternalEvent = Union[
    RunStarted,
    AgentMessageDelta,
    ThinkingDelta,
    VerificationReport,
    ToolCallStarted,
    ToolCallFinished,
    ApprovalRequired,
    UsageReport,
    RunCompleted,
    RunFailed,
]

_TYPE_NAME_MAP: dict[type, str] = {
    RunStarted: "run_started",
    AgentMessageDelta: "agent_message_delta",
    ThinkingDelta: "thinking_delta",
    VerificationReport: "verification_report",
    ToolCallStarted: "tool_call_started",
    ToolCallFinished: "tool_call_finished",
    ApprovalRequired: "approval_required",
    UsageReport: "usage_report",
    RunCompleted: "run_completed",
    RunFailed: "run_failed",
}

# ---------------------------------------------------------------------------
# Layer 1: LangGraph astream_events v2 -> Internal events
# ---------------------------------------------------------------------------


def adapt_langgraph_event(event: dict[str, Any]) -> InternalEvent | None:
    """Convert a LangGraph astream_events v2 event to an internal event.

    Returns None if the event is not relevant to our SSE contract.
    """
    kind: str = event.get("event", "")
    data: dict[str, Any] = event.get("data", {})

    # Chat model token stream
    if kind == "on_chat_model_stream":
        chunk = data.get("chunk")
        if chunk is None:
            return None
        content = getattr(chunk, "content", "")
        if isinstance(content, list):
            text_parts: list[str] = []
            thinking_parts: list[str] = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "thinking":
                        thinking_parts.append(block.get("thinking", ""))
                    elif block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                elif isinstance(block, str):
                    text_parts.append(block)
            # Prefer thinking delta if present
            if thinking_parts:
                thinking_content = "".join(thinking_parts)
                if thinking_content:
                    return ThinkingDelta(content=thinking_content)
            content = "".join(text_parts)
        if content:
            return AgentMessageDelta(content=content)
        return None

    # Tool invocation started
    if kind == "on_tool_start":
        tool_name = event.get("name", "unknown")
        run_id = event.get("run_id", "")
        input_data = data.get("input", {})
        if isinstance(input_data, str):
            input_data = {"raw": input_data}
        return ToolCallStarted(
            tool_name=tool_name,
            tool_call_id=run_id,
            input_data=input_data,
        )

    # Tool invocation finished
    if kind == "on_tool_end":
        run_id = event.get("run_id", "")
        output = data.get("output")
        # Unwrap LangChain message objects (ToolMessage, AIMessage, etc.)
        if hasattr(output, "content"):
            output = output.content
        is_error = False
        if hasattr(output, "status"):
            is_error = output.status == "error"
        elif isinstance(output, dict):
            is_error = output.get("is_error", False)
        # Ensure output is JSON-serialisable
        if isinstance(output, bytes):
            output = output.decode()
        elif not isinstance(output, (str, dict, list, int, float, bool, type(None))):
            output = str(output)
        return ToolCallFinished(
            tool_call_id=run_id,
            result=output,
            is_error=is_error,
        )

    # Graph start -> RunStarted
    if kind == "on_chain_start" and event.get("name") == "LangGraph":
        run_id = event.get("run_id", "")
        metadata = event.get("metadata", {})
        thread_id = metadata.get("thread_id", "")
        return RunStarted(run_id=run_id, thread_id=thread_id)

    return None


# ---------------------------------------------------------------------------
# Layer 2: Internal events -> SSE-serialisable dicts
# ---------------------------------------------------------------------------


def to_sse_dict(event: InternalEvent) -> dict[str, Any]:
    """Convert an internal event to a JSON-serialisable SSE dict.

    Always contains a "type" key matching the SSE contract.
    """
    event_type = _TYPE_NAME_MAP.get(type(event))
    if event_type is None:
        raise ValueError(f"Unknown internal event type: {type(event).__name__}")

    payload = asdict(event)
    payload["type"] = event_type
    return payload
