"""Tests for MCP tool provider error handling and formatting."""

from __future__ import annotations

import asyncio
import os
import sys
import types
from types import SimpleNamespace

import httpx
import pytest

os.environ.setdefault("AI_INTERNAL_TOKEN", "test-ai-internal-token")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-deepseek-key")

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")


class _ChatDeepSeekStub:  # pragma: no cover - import stub only
    pass


_deepseek_stub.ChatDeepSeek = _ChatDeepSeekStub
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)


class _ChatOpenAIStub:  # pragma: no cover - import stub only
    pass


_openai_stub.ChatOpenAI = _ChatOpenAIStub
sys.modules.setdefault("langchain_openai", _openai_stub)

from application.credential_service import (  # noqa: E402
    McpAuthFailed,
    McpProtocolError,
    McpToolDiscoveryFailed,
    McpUnavailable,
)
from services.mcp_tool_provider import (  # noqa: E402
    MCPToolProvider,
    _format_tool_result,
)


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


def test_tool_policy_blocks_denied_qjudge_grading_action(monkeypatch):
    provider = MCPToolProvider(
        server_url="http://example.invalid/mcp",
        tool_policy={
            "qjudge_grading": {
                "deny_actions": ["list_answers", "question_detail", "dashboard"],
            }
        },
    )
    tool_def = SimpleNamespace(
        name="qjudge_grading",
        description="grading",
        inputSchema={"type": "object", "properties": {}},
    )

    async def _should_not_call(*args, **kwargs):
        raise AssertionError("denied tool action should not reach MCP")

    monkeypatch.setattr(provider, "_call_tool", _should_not_call)

    tool = provider._build_langchain_tool(tool_def)
    for action in ("list_answers", "question_detail", "dashboard"):
        result = asyncio.run(
            tool.ainvoke(
                {
                    "action": action,
                    "contest_id": "11111111-1111-1111-1111-111111111111",
                }
            )
        )

        assert result["is_error"] is True
        assert result["error_code"] == "TOOL_ACTION_DENIED"
        assert action in result["detail"]


class _AsyncContext:
    def __init__(self, value=None, error: Exception | None = None):
        self.value = value
        self.error = error
        self.closed = False

    async def __aenter__(self):
        if self.error is not None:
            raise self.error
        return self.value

    async def __aexit__(self, exc_type, exc, tb):
        self.closed = True


class _ProbeSession(_AsyncContext):
    def __init__(self, pages, initialize_error: Exception | None = None):
        super().__init__(self)
        self.pages = list(pages)
        self.initialize_error = initialize_error
        self.initialized = 0
        self.cursors = []

    async def initialize(self):
        self.initialized += 1
        if self.initialize_error is not None:
            raise self.initialize_error

    async def list_tools(self, cursor=None):
        self.cursors.append(cursor)
        page = self.pages.pop(0)
        if isinstance(page, Exception):
            raise page
        return page


def _install_probe_transport(monkeypatch, session, *, connect_error=None):
    import services.mcp_tool_provider as module

    transport = _AsyncContext(
        (object(), object(), None),
        error=connect_error,
    )
    monkeypatch.setattr(module, "streamablehttp_client", lambda *a, **kw: transport)
    monkeypatch.setattr(module, "ClientSession", lambda *a, **kw: session)
    return transport


def test_probe_initializes_and_reads_every_tool_page(monkeypatch):
    session = _ProbeSession(
        [
            SimpleNamespace(
                tools=[
                    SimpleNamespace(
                        name="first", inputSchema={"type": "object"}
                    )
                ],
                nextCursor="next-page",
            ),
            SimpleNamespace(
                tools=[
                    SimpleNamespace(
                        name="second", inputSchema={"type": "object"}
                    )
                ],
                nextCursor=None,
            ),
        ]
    )
    transport = _install_probe_transport(monkeypatch, session)
    provider = MCPToolProvider(
        server_url="http://example.invalid/mcp",
        authorization_header="Bearer mcp-token",
    )

    asyncio.run(provider.probe())

    assert session.initialized == 1
    assert session.cursors == [None, "next-page"]
    assert session.closed is True
    assert transport.closed is True


def test_probe_maps_connection_failure_to_unavailable(monkeypatch):
    session = _ProbeSession([])
    _install_probe_transport(
        monkeypatch,
        session,
        connect_error=ConnectionError("offline"),
    )
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")

    with pytest.raises(McpUnavailable) as raised:
        asyncio.run(provider.probe())

    assert raised.value.code == "MCP_UNAVAILABLE"


def test_probe_maps_initialize_failure_to_protocol_error(monkeypatch):
    session = _ProbeSession([], initialize_error=RuntimeError("bad handshake"))
    _install_probe_transport(monkeypatch, session)
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")

    with pytest.raises(McpProtocolError) as raised:
        asyncio.run(provider.probe())

    assert raised.value.code == "MCP_PROTOCOL_ERROR"


def test_probe_maps_initialize_timeout_to_unavailable(monkeypatch):
    session = _ProbeSession([], initialize_error=asyncio.TimeoutError())
    _install_probe_transport(monkeypatch, session)
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")

    with pytest.raises(McpUnavailable) as raised:
        asyncio.run(provider.probe())

    assert raised.value.code == "MCP_UNAVAILABLE"


def test_probe_maps_malformed_tools_to_discovery_error(monkeypatch):
    session = _ProbeSession(
        [
            SimpleNamespace(
                tools=[SimpleNamespace(name="", inputSchema=[])],
                nextCursor=None,
            )
        ]
    )
    _install_probe_transport(monkeypatch, session)
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")

    with pytest.raises(McpToolDiscoveryFailed) as raised:
        asyncio.run(provider.probe())

    assert raised.value.code == "MCP_TOOL_DISCOVERY_FAILED"


def test_probe_rejects_repeated_pagination_cursor_and_closes(monkeypatch):
    repeated_page = SimpleNamespace(tools=[], nextCursor="same-cursor")
    session = _ProbeSession([repeated_page, repeated_page])
    transport = _install_probe_transport(monkeypatch, session)
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")

    with pytest.raises(McpToolDiscoveryFailed) as raised:
        asyncio.run(provider.probe())

    assert raised.value.code == "MCP_TOOL_DISCOVERY_FAILED"
    assert session.cursors == [None, "same-cursor"]
    assert session.closed is True
    assert transport.closed is True


def test_probe_rejects_discovery_that_exceeds_page_bound(monkeypatch):
    import services.mcp_tool_provider as module

    monkeypatch.setattr(module, "_MAX_TOOL_DISCOVERY_PAGES", 2)
    session = _ProbeSession(
        [
            SimpleNamespace(tools=[], nextCursor="page-2"),
            SimpleNamespace(tools=[], nextCursor="page-3"),
        ]
    )
    transport = _install_probe_transport(monkeypatch, session)
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")

    with pytest.raises(McpToolDiscoveryFailed) as raised:
        asyncio.run(provider.probe())

    assert raised.value.code == "MCP_TOOL_DISCOVERY_FAILED"
    assert session.cursors == [None, "page-2"]
    assert session.closed is True
    assert transport.closed is True


def _http_status_error(status_code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://example.invalid/mcp")
    response = httpx.Response(status_code, request=request)
    return httpx.HTTPStatusError(
        "delegated credential rejected",
        request=request,
        response=response,
    )


@pytest.mark.parametrize("status_code", [401, 403])
@pytest.mark.parametrize("boundary", ["connection", "initialize", "discovery"])
def test_probe_maps_http_auth_failures_at_each_boundary(
    monkeypatch,
    status_code,
    boundary,
):
    auth_error = _http_status_error(status_code)
    connect_error = auth_error if boundary == "connection" else None
    initialize_error = auth_error if boundary == "initialize" else None
    pages = (
        [auth_error]
        if boundary == "discovery"
        else [SimpleNamespace(tools=[], nextCursor=None)]
    )
    session = _ProbeSession(pages, initialize_error=initialize_error)
    transport = _install_probe_transport(
        monkeypatch,
        session,
        connect_error=connect_error,
    )
    provider = MCPToolProvider(server_url="http://example.invalid/mcp")

    with pytest.raises(McpAuthFailed) as raised:
        asyncio.run(provider.probe())

    assert raised.value.code == "MCP_AUTH_FAILED"
    if boundary != "connection":
        assert session.closed is True
        assert transport.closed is True
