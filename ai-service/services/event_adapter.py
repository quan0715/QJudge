"""Two-layer event adapter.

Layer 1: LangGraph raw streaming events  ->  Internal event dataclasses
Layer 2: Internal event dataclasses       ->  SSE-serialisable dicts
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, Union

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
class SummarizationStarted:
    pass


@dataclass(slots=True)
class SummarizationEnded:
    """Emitted after the summarization model call completes (pair for SummarizationStarted)."""
    pass


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


@dataclass(slots=True)
class AwaitingApproval:
    """Emitted when the agent pauses for human approval before executing a tool."""
    thread_id: str
    action_requests: list[dict]   # [{"name": tool_name, "args": {...}}]
    review_configs: list[dict]    # [{"action_name": ..., "allowed_decisions": [...]}]


InternalEvent = Union[
    RunStarted,
    AgentMessageDelta,
    ThinkingDelta,
    SummarizationStarted,
    SummarizationEnded,
    VerificationReport,
    ToolCallStarted,
    ToolCallFinished,
    UsageReport,
    RunCompleted,
    RunFailed,
    AwaitingApproval,
]

_TYPE_NAME_MAP: dict[type, str] = {
    RunStarted: "run_started",
    AgentMessageDelta: "agent_message_delta",
    ThinkingDelta: "thinking_delta",
    SummarizationStarted: "summarization_started",
    SummarizationEnded: "summarization_ended",
    VerificationReport: "verification_report",
    ToolCallStarted: "tool_call_started",
    ToolCallFinished: "tool_call_finished",
    UsageReport: "usage_report",
    RunCompleted: "run_completed",
    RunFailed: "run_failed",
    AwaitingApproval: "awaiting_approval",
}

# ---------------------------------------------------------------------------
# Layer 1: LangGraph astream_events v2 -> Internal events
# ---------------------------------------------------------------------------


def adapt_langgraph_event(event: dict[str, Any]) -> list[InternalEvent] | None:
    """Convert a LangGraph astream_events v2 event to internal event(s).

    Returns None if the event is not relevant to our SSE contract.
    A single LangGraph event may produce multiple internal events
    (e.g. a chunk containing both thinking and text content).
    """
    kind: str = event.get("event", "")
    data: dict[str, Any] = event.get("data", {})

    # Chat model token stream
    if kind == "on_chat_model_stream":
        chunk = data.get("chunk")
        if chunk is None:
            return None

        results: list[InternalEvent] = []

        additional_kwargs = (
            getattr(chunk, "additional_kwargs", None)
            if hasattr(chunk, "additional_kwargs")
            else None
        )
        if isinstance(additional_kwargs, dict):
            thinking_from_kwargs = _extract_reasoning_from_additional_kwargs(
                additional_kwargs
            )
            if thinking_from_kwargs:
                results.append(ThinkingDelta(content=thinking_from_kwargs))

        content = getattr(chunk, "content", "")
        if isinstance(content, list):
            text_parts: list[str] = []
            thinking_parts: list[str] = []
            for block in content:
                if isinstance(block, dict):
                    block_type = block.get("type")
                    if block_type in {"thinking", "reasoning"}:
                        thinking_parts.extend(
                            _extract_text_fragments(
                                block,
                                preferred_keys=("thinking", "reasoning", "text"),
                            )
                        )
                    elif block_type == "text":
                        text_parts.extend(
                            _extract_text_fragments(
                                block,
                                preferred_keys=("text",),
                            )
                        )
                elif isinstance(block, str):
                    text_parts.append(block)
            # Emit both thinking and text when both are present in the same chunk
            if thinking_parts:
                thinking_content = "".join(thinking_parts)
                if thinking_content:
                    results.append(ThinkingDelta(content=thinking_content))
            text_content = "".join(text_parts)
            if text_content:
                results.append(AgentMessageDelta(content=text_content))
        else:
            if content:
                results.append(AgentMessageDelta(content=content))
                
        return results or None

    # Tool invocation started
    if kind == "on_tool_start":
        tool_name = event.get("name", "unknown")
        run_id = event.get("run_id", "")
        input_data = data.get("input", {})
        if isinstance(input_data, str):
            input_data = {"raw": input_data}
        return [ToolCallStarted(
            tool_name=tool_name,
            tool_call_id=run_id,
            input_data=input_data,
        )]

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
        return [ToolCallFinished(
            tool_call_id=run_id,
            result=output,
            is_error=is_error,
        )]

    # Note: on_chain_start → RunStarted removed.
    # RunStarted is emitted manually by the runner with a stable run_id,
    # avoiding duplicate run_started events.

    return None


def _extract_reasoning_from_additional_kwargs(
    additional_kwargs: dict[str, Any],
) -> str:
    parts: list[str] = []

    # Common fields observed across providers / wrappers.
    candidate_keys = (
        "reasoning_content",
        "reasoning",
        "reasoning_text",
        "thinking",
    )
    for key in candidate_keys:
        if key not in additional_kwargs:
            continue
        parts.extend(
            _extract_text_fragments(
                additional_kwargs[key],
                preferred_keys=("text", "content", "reasoning", "thinking"),
            )
        )

    # OpenAI-compatible chunks may carry content blocks under additional_kwargs.
    # Example shapes:
    # - {"reasoning": {"content": [...]}}
    # - {"reasoning": [{"type": "reasoning", "text": "..."}]}
    return "".join(parts)


def _extract_text_fragments(
    value: Any,
    *,
    preferred_keys: Iterable[str],
) -> list[str]:
    if value is None:
        return []

    if isinstance(value, str):
        return [value]

    if isinstance(value, (int, float, bool)):
        return [str(value)]

    if isinstance(value, dict):
        parts: list[str] = []
        for key in preferred_keys:
            if key in value:
                parts.extend(
                    _extract_text_fragments(
                        value[key],
                        preferred_keys=preferred_keys,
                    )
                )
        return parts

    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            parts.extend(
                _extract_text_fragments(item, preferred_keys=preferred_keys)
            )
        return parts

    return []


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
