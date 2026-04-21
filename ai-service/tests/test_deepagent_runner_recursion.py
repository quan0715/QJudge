"""Tests for recursion-interruption helpers in DeepAgentRunner."""

from __future__ import annotations

import sys
import types

from langchain_core.messages import AIMessage
from langgraph.errors import GraphRecursionError

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

from services.deepagent_runner import DeepAgentRunner  # noqa: E402


def test_is_graph_recursion_error_detects_direct_instance():
    err = GraphRecursionError("recursion")
    assert DeepAgentRunner._is_graph_recursion_error(err) is True


def test_fallback_recursion_summary_contains_continue_hint():
    summary = DeepAgentRunner._fallback_recursion_summary()
    assert "繼續任務" in summary


def test_format_message_for_summary_includes_tool_metadata():
    message = AIMessage(content="tool failed")
    setattr(message, "tool_call_id", "call-1")
    setattr(message, "status", "error")

    line = DeepAgentRunner._format_message_for_summary(message)

    assert "tool_call_id=call-1" in line
    assert "status=error" in line
