"""Unit tests for LangGraph -> internal event adaptation."""

from __future__ import annotations

import sys
import types

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

from services.event_adapter import (
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


def test_adapt_legacy_thinking_block_still_supported():
    chunk = _Chunk(content=[{"type": "thinking", "thinking": "old-think"}])

    events = adapt_langgraph_event(_stream_event(chunk))

    assert events is not None
    assert len(events) == 1
    assert isinstance(events[0], ThinkingDelta)
    assert events[0].content == "old-think"


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
