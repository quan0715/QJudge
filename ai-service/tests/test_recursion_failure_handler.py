from __future__ import annotations

import asyncio
import sys
import types
from types import SimpleNamespace

from langchain_core.messages import AIMessage
from langgraph.errors import GraphRecursionError

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")
_deepseek_stub.ChatDeepSeek = type("ChatDeepSeek", (), {})
_openai_stub.ChatOpenAI = type("ChatOpenAI", (), {})
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from services.runtime.recursion_failure_handler import RecursionFailureHandler


class _FakeSummaryModel:
    async def ainvoke(self, _prompt: str):
        return SimpleNamespace(content="摘要完成")


class _FakeAgent:
    def __init__(self, messages):
        self._messages = messages

    async def aget_state(self, _config):
        return SimpleNamespace(values={"messages": self._messages})


def test_is_graph_recursion_error_detects_direct_and_nested():
    assert RecursionFailureHandler.is_graph_recursion_error(GraphRecursionError("x")) is True

    class _Nested(Exception):
        def __init__(self):
            self.exceptions = [GraphRecursionError("x")]

    assert RecursionFailureHandler.is_graph_recursion_error(_Nested()) is True


def test_format_message_for_summary_includes_tool_metadata():
    message = AIMessage(content="tool failed")
    setattr(message, "tool_call_id", "call-1")
    setattr(message, "status", "error")

    line = RecursionFailureHandler.format_message_for_summary(message)

    assert "tool_call_id=call-1" in line
    assert "status=error" in line


def test_summarize_interruption_uses_summary_model_result():
    handler = RecursionFailureHandler(model_factory=lambda _model_id: _FakeSummaryModel())
    agent = _FakeAgent([AIMessage(content="hello")])

    result = asyncio.run(handler.summarize_interruption(agent=agent, config={}))

    assert result == "摘要完成"
