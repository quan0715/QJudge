"""Unit tests for LangGraph -> internal event adaptation."""

from __future__ import annotations

import sys
import types

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.types import Command

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")


class _ChatDeepSeekStub:  # pragma: no cover - import stub only
    pass


class _ChatOpenAIStub:  # pragma: no cover - import stub only
    pass


_deepseek_stub.ChatDeepSeek = _ChatDeepSeekStub
_openai_stub.ChatOpenAI = _ChatOpenAIStub
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from infrastructure.agent.event_adapter import (
    AgentMessageDelta,
    ThinkingDelta,
    adapt_langgraph_event,
)


class _Chunk:
    def __init__(self, content, additional_kwargs=None):
        self.content = content
        self.additional_kwargs = additional_kwargs or {}


def _stream_event(chunk: _Chunk) -> dict:
    return {"event": "on_chat_model_stream", "data": {"chunk": chunk}}


def test_adapt_openai_reasoning_text_in_additional_kwargs():
    chunk = _Chunk(
        content="final answer",
        additional_kwargs={"reasoning": {"text": "step-by-step"}},
    )

    events = adapt_langgraph_event(_stream_event(chunk))

    assert events is not None
    assert isinstance(events[0], ThinkingDelta)
    assert events[0].content == "step-by-step"
    assert isinstance(events[1], AgentMessageDelta)
    assert events[1].content == "final answer"


def test_adapt_reasoning_content_blocks_and_text_blocks():
    chunk = _Chunk(
        content=[
            {"type": "reasoning", "text": "think-a"},
            {"type": "text", "text": "answer-a"},
        ]
    )

    events = adapt_langgraph_event(_stream_event(chunk))

    assert events is not None
    assert isinstance(events[0], ThinkingDelta)
    assert events[0].content == "think-a"
    assert isinstance(events[1], AgentMessageDelta)
    assert events[1].content == "answer-a"


def test_adapt_openai_responses_api_reasoning_summary_block():
    """OpenAI Responses API (output_version=responses/v1) emits reasoning
    with a nested `summary[].text` shape. The adapter must extract the text
    even though it's not directly on the block's `reasoning` / `text` key.
    """
    chunk = _Chunk(
        content=[
            {
                "type": "reasoning",
                "index": 0,
                "summary": [
                    {"index": 0, "type": "summary_text", "text": "Let me "},
                    {"index": 0, "type": "summary_text", "text": "think."},
                ],
            },
            {"type": "text", "text": "answer"},
        ]
    )

    events = adapt_langgraph_event(_stream_event(chunk))

    assert events is not None
    assert isinstance(events[0], ThinkingDelta)
    assert events[0].content == "Let me think."
    assert isinstance(events[1], AgentMessageDelta)
    assert events[1].content == "answer"


# ---------------------------------------------------------------------------
# Subagent attribution
# ---------------------------------------------------------------------------

from infrastructure.agent.event_adapter import (  # noqa: E402
    SubagentEventTracker,
    ToolCallFinished,
    ToolCallStarted,
    to_sse_dict,
)


def _raw(kind: str, run_id: str, parent_ids: list[str], name: str = "", data=None):
    return {
        "event": kind,
        "run_id": run_id,
        "parent_ids": parent_ids,
        "name": name,
        "data": data if data is not None else {},
    }


def _annotate(tracker: SubagentEventTracker, raw: dict):
    return tracker.annotate(raw, adapt_langgraph_event(raw) or [])


def _tool_start(run_id, parents, name):
    return _raw("on_tool_start", run_id, parents, name, {"input": {}})


def _tool_end(run_id, parents, name, output="ok"):
    return _raw("on_tool_end", run_id, parents, name, {"output": output})


def _chat_stream(parents, text, thinking=None):
    raw = _stream_event(
        _Chunk(text, {"reasoning_content": thinking} if thinking else None)
    )
    raw.update({"run_id": "m", "parent_ids": parents, "name": "model"})
    return raw


def test_tracker_tags_tool_events_under_task():
    tracker = SubagentEventTracker()
    task_events = _annotate(tracker, _tool_start("T1", ["root"], "task"))
    child_events = _annotate(tracker, _tool_start("C1", ["root", "T1", "x"], "echo_tool"))

    assert isinstance(task_events[0], ToolCallStarted)
    assert task_events[0].parent_tool_call_id is None
    assert isinstance(child_events[0], ToolCallStarted)
    assert child_events[0].parent_tool_call_id == "T1"


def test_tracker_tags_message_and_thinking_deltas():
    tracker = SubagentEventTracker()
    _annotate(tracker, _tool_start("T1", ["root"], "task"))
    events = _annotate(tracker, _chat_stream(["root", "T1"], "讀取作答", thinking="想一下"))

    assert [type(e) for e in events] == [ThinkingDelta, AgentMessageDelta]
    assert all(e.parent_tool_call_id == "T1" for e in events)


def test_tracker_separates_sequential_task_calls():
    tracker = SubagentEventTracker()
    _annotate(tracker, _tool_start("T1", ["root"], "task"))
    first = _annotate(tracker, _tool_start("C1", ["root", "T1"], "echo_tool"))
    _annotate(tracker, _tool_end("T1", ["root"], "task"))
    _annotate(tracker, _tool_start("T2", ["root"], "task"))
    second = _annotate(tracker, _tool_start("C2", ["root", "T2"], "echo_tool"))

    assert first[0].parent_tool_call_id == "T1"
    assert second[0].parent_tool_call_id == "T2"


def test_tracker_releases_task_after_error_end():
    tracker = SubagentEventTracker()
    _annotate(tracker, _tool_start("T1", ["root"], "task"))
    end_events = _annotate(
        tracker, _tool_end("T1", ["root"], "task", output={"is_error": True})
    )
    after = _annotate(tracker, _chat_stream(["root"], "主代理"))

    assert isinstance(end_events[0], ToolCallFinished)
    assert end_events[0].parent_tool_call_id is None
    assert after[0].parent_tool_call_id is None


def test_sse_dict_omits_null_parent_tool_call_id():
    assert set(to_sse_dict(AgentMessageDelta(content="x"))) == {"type", "content"}
    tagged = to_sse_dict(AgentMessageDelta(content="x", parent_tool_call_id="T1"))
    assert tagged["parent_tool_call_id"] == "T1"


@pytest.mark.parametrize("content", [
    "## Q3 批改完成\n\n- 已寫入 **16** 份成績。",
    [{"type": "text", "text": "**完成**"}, {"type": "image_url", "image_url": {"url": "https://example.com/result.png"}}],
])
def test_command_tool_result_exposes_message_content_without_internal_state(content):
    output = Command(update={
        "messages": [AIMessage(content="internal reasoning"), ToolMessage(content=content, tool_call_id="call_task")],
        "files": {"/scratch/private.txt": {"content": ["internal state"]}},
    })

    events = adapt_langgraph_event(_tool_end("task-run", [], "task", output))

    assert len(events) == 1
    assert events[0].result == content
    assert events[0].tool_call_id == "task-run"
    assert events[0].is_error is False
    assert to_sse_dict(events[0])["result"] == content


@pytest.mark.parametrize("wrapped", [False, True])
def test_tool_message_error_status_survives_content_unwrapping(wrapped):
    output = ToolMessage(content="找不到作答", tool_call_id="call_tool", status="error")
    if wrapped:
        output = Command(update={"messages": [output]})

    events = adapt_langgraph_event(_tool_end("tool-run", [], "task", output))

    assert events[0].result == "找不到作答"
    assert events[0].is_error is True


@pytest.mark.parametrize("output", [
    "ordinary tool output",
    {"messages": [{"content": "ordinary data"}], "count": 1},
    {"is_error": True, "detail": "request failed"},
])
def test_ordinary_tool_outputs_remain_intact(output):
    events = adapt_langgraph_event(_tool_end("tool-run", [], "ordinary", output))

    assert events[0].result == output
    assert events[0].is_error is (isinstance(output, dict) and output.get("is_error", False))


def test_state_only_command_does_not_expose_graph_state_as_tool_result():
    output = Command(update={"private_state": "not a tool response"})

    events = adapt_langgraph_event(_tool_end("tool-run", [], "state_tool", output))

    assert events[0].result == ""
    assert events[0].is_error is False


def test_tool_error_finishes_the_failed_attempt():
    events = adapt_langgraph_event({"event": "on_tool_error", "run_id": "failed-call", "name": "save_grading_draft", "data": {"error": ValueError("rubric must be an object")}})
    assert len(events) == 1
    assert events[0].tool_call_id == "failed-call"
    assert events[0].is_error is True
    assert events[0].result == "rubric must be an object"
