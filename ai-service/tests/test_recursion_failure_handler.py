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

from domain.model_catalog import ModelNotAvailable
from infrastructure.agent.recursion_failure_handler import RecursionFailureHandler


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


def test_summarize_interruption_builds_the_model_off_the_event_loop():
    def off_loop(_model_id):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return _FakeSummaryModel()
        raise AssertionError("model factory ran on the event loop")

    handler = RecursionFailureHandler(model_factory=off_loop)
    agent = _FakeAgent([AIMessage(content="hello")])

    assert asyncio.run(handler.summarize_interruption(agent=agent, config={})) == "摘要完成"


def test_summarize_interruption_falls_back_without_an_available_model():
    def no_model(model_id):
        raise ModelNotAvailable(model_id)

    handler = RecursionFailureHandler(model_factory=no_model)
    agent = _FakeAgent([AIMessage(content="hello")])

    result = asyncio.run(handler.summarize_interruption(agent=agent, config={}))

    assert result == RecursionFailureHandler.fallback_recursion_summary()
