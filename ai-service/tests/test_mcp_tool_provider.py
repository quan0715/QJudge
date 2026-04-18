"""Tests for MCP tool provider error handling and formatting."""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace
import types

os.environ.setdefault("AI_INTERNAL_TOKEN", "test-ai-internal-token")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-deepseek-key")

_deepseek_stub = types.ModuleType("langchain_deepseek")


class _ChatDeepSeekStub:  # pragma: no cover - import stub only
    pass


_deepseek_stub.ChatDeepSeek = _ChatDeepSeekStub
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)

from services.mcp_tool_provider import MCPToolProvider, _format_tool_result  # noqa: E402


def test_format_tool_result_empty_error_payload_has_fallback_message():
    result = SimpleNamespace(
        structuredContent=None,
        content=[],
        isError=True,
    )
    formatted = _format_tool_result(result)
    assert formatted["is_error"] is True
    assert formatted["content"] == "MCP tool failed with empty error message"


def test_invoke_returns_structured_transport_error(monkeypatch):
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")
    tool_def = SimpleNamespace(
        name="qjudge_code_runner",
        description="run code",
        inputSchema={"type": "object", "properties": {}},
    )

    async def _raise_transport_error(*args, **kwargs):
        raise RuntimeError("")

    monkeypatch.setattr(provider, "_call_tool", _raise_transport_error)

    tool = provider._build_langchain_tool(tool_def)
    result = asyncio.run(
        tool.ainvoke({"problem_id": "p-1", "language": "cpp", "code": "int main(){}"})
    )

    assert result["is_error"] is True
    assert result["detail"] == "MCP transport error in qjudge_code_runner"
    assert result["exception"].startswith("RuntimeError:")
