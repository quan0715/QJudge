"""MCP-backed tool loading for DeepAgent."""

from __future__ import annotations

import asyncio
import logging
from contextlib import AsyncExitStack
from typing import Any

import httpx
from langchain_core.tools import BaseTool, StructuredTool
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.types import CallToolResult, Tool

from config import get_settings
from domain.ports import (
    McpAuthFailed,
    McpProtocolError,
    McpToolDiscoveryFailed,
    McpUnavailable,
)

logger = logging.getLogger(__name__)


def _preview_for_log(value: Any, *, limit: int = 500) -> str:
    """Best-effort compact preview for logs (avoid giant payload spam)."""
    try:
        text = str(value)
    except Exception:
        text = repr(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...(truncated)"


class MCPToolProvider:
    """Connect to QJudge MCP and expose tools as LangChain tools."""

    def __init__(
        self,
        *,
        server_url: str,
        authorization_header: str | None = None,
        tool_policy: dict[str, Any] | None = None,
    ) -> None:
        self._server_url = server_url
        self._authorization_header = authorization_header
        self._tool_policy = tool_policy or {}
        self._stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None

    async def __aenter__(self) -> "MCPToolProvider":
        await self._connect()
        try:
            await self._initialize()
        except Exception:
            await self._close()
            raise
        return self

    async def _connect(self) -> None:
        stack = AsyncExitStack()
        headers: dict[str, str] = {}
        if self._authorization_header:
            headers["Authorization"] = self._authorization_header

        try:
            read_stream, write_stream, _ = await stack.enter_async_context(
                streamablehttp_client(
                    self._server_url,
                    headers=headers or None,
                )
            )
            session = ClientSession(read_stream, write_stream)
            await stack.enter_async_context(session)
        except Exception:
            await stack.aclose()
            raise

        self._stack = stack
        self._session = session

    async def _initialize(self) -> None:
        settings = get_settings()
        session = self._require_session()
        await asyncio.wait_for(
            session.initialize(),
            timeout=max(0.5, settings.mcp_initialize_timeout_seconds),
        )

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self._close()

    async def _close(self) -> None:
        if self._stack is not None:
            try:
                await self._stack.aclose()
            except Exception as close_exc:
                # MCP client may send a cleanup request during close; ignore errors
                # (e.g. 401 on the teardown POST) since the work is already done.
                logger.debug("MCP session close error (ignored): %s", close_exc)
        self._stack = None
        self._session = None

    async def load_tools(self) -> list[BaseTool]:
        """Load all MCP tool definitions and wrap them for LangChain."""
        tools = await self._list_tool_definitions()
        return [self._build_langchain_tool(tool) for tool in tools]

    async def probe(self) -> None:
        """Initialize MCP and validate every tool discovery page, then close."""
        try:
            await self._connect()
        except Exception as exc:
            raise _map_connection_error(exc) from exc

        try:
            try:
                await self._initialize()
            except Exception as exc:
                raise _map_initialize_error(exc) from exc

            try:
                await self._list_tool_definitions(validate=True)
            except (McpAuthFailed, McpUnavailable):
                raise
            except Exception as exc:
                raise _map_discovery_error(exc) from exc
        finally:
            await self._close()

    async def _list_tool_definitions(self, *, validate: bool = False) -> list[Tool]:
        settings = get_settings()
        session = self._require_session()
        tools: list[Tool] = []
        cursor: str | None = None

        while True:
            result = await asyncio.wait_for(
                session.list_tools(cursor=cursor),
                timeout=max(0.5, settings.mcp_list_tools_timeout_seconds),
            )
            if validate:
                _validate_tool_page(result)
            tools.extend(result.tools)
            cursor = result.nextCursor
            if not cursor:
                break

        return tools

    def _build_langchain_tool(self, tool_def: Tool) -> BaseTool:
        description = tool_def.description or f"MCP tool: {tool_def.name}"
        args_schema = tool_def.inputSchema or {"type": "object", "properties": {}}

        async def _invoke(**kwargs: Any) -> Any:
            policy_error = self._policy_error(tool_def.name, kwargs or {})
            if policy_error is not None:
                logger.warning(
                    "mcp_tool %s blocked by tool policy args=%s detail=%s",
                    tool_def.name,
                    _preview_for_log(kwargs),
                    policy_error["detail"],
                )
                return policy_error
            try:
                result = await self._call_tool(tool_def.name, kwargs or None)
            except Exception as exc:
                detail = f"{type(exc).__name__}: {exc!r}"
                logger.exception(
                    "mcp_tool %s transport exception args=%s detail=%s",
                    tool_def.name,
                    _preview_for_log(kwargs),
                    detail,
                )
                return {
                    "is_error": True,
                    "detail": f"MCP transport error in {tool_def.name}",
                    "exception": detail,
                }

            formatted = _format_tool_result(result)
            if result.isError:
                logger.warning(
                    "mcp_tool %s unsuccessful args=%s payload=%s",
                    tool_def.name,
                    _preview_for_log(kwargs),
                    _preview_for_log(formatted),
                )
            else:
                logger.info("mcp_tool %s ok", tool_def.name)
            return formatted

        return StructuredTool(
            name=tool_def.name,
            description=description,
            args_schema=args_schema,
            coroutine=_invoke,
        )

    def _policy_error(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any] | None:
        tool_policy = self._tool_policy.get(tool_name)
        if not isinstance(tool_policy, dict):
            return None
        denied_actions = tool_policy.get("deny_actions")
        if not isinstance(denied_actions, list):
            return None
        action = arguments.get("action")
        if isinstance(action, str) and action in set(denied_actions):
            return {
                "is_error": True,
                "error_code": "TOOL_ACTION_DENIED",
                "detail": (
                    f"{tool_name} action `{action}` is blocked by the current "
                    "run policy."
                ),
            }
        return None

    async def _call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any] | None,
    ) -> CallToolResult:
        settings = get_settings()
        session = self._require_session()
        return await asyncio.wait_for(
            session.call_tool(tool_name, arguments=arguments),
            timeout=max(0.5, settings.mcp_call_tool_timeout_seconds),
        )

    def _require_session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("MCP session is not initialized")
        return self._session


def _format_tool_result(result: CallToolResult) -> Any:
    """Normalise MCP tool results into a compact JSON-serialisable shape."""
    payload: Any
    if result.structuredContent is not None:
        payload = result.structuredContent
    else:
        payload = _flatten_content_blocks(result.content)

    if result.isError:
        # Some MCP transports return an empty string for bare ToolError.
        if payload in ("", None, []):
            payload = "MCP tool failed with empty error message"
        if isinstance(payload, dict):
            return {
                "is_error": True,
                **payload,
            }
        return {
            "is_error": True,
            "content": payload,
        }
    return payload


def _flatten_content_blocks(blocks: list[Any]) -> Any:
    text_parts: list[str] = []
    serialised_blocks: list[Any] = []

    for block in blocks:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            text_parts.append(text)
            continue

        if hasattr(block, "model_dump"):
            serialised_blocks.append(block.model_dump(exclude_none=True))
            continue

        if isinstance(block, dict):
            serialised_blocks.append(block)
            continue

        serialised_blocks.append(str(block))

    if text_parts and not serialised_blocks:
        return "\n".join(part for part in text_parts if part)
    if text_parts:
        serialised_blocks.insert(0, {"text": "\n".join(part for part in text_parts if part)})
    return serialised_blocks


def _validate_tool_page(result: Any) -> None:
    tools = getattr(result, "tools", None)
    cursor = getattr(result, "nextCursor", None)
    if not isinstance(tools, list):
        raise ValueError("MCP list_tools response has no tool list")
    if cursor is not None and not isinstance(cursor, str):
        raise ValueError("MCP list_tools cursor is malformed")
    for tool in tools:
        if not isinstance(getattr(tool, "name", None), str) or not tool.name:
            raise ValueError("MCP tool name is malformed")
        if not isinstance(getattr(tool, "inputSchema", None), dict):
            raise ValueError(f"MCP tool {tool.name} has a malformed input schema")


def _walk_exceptions(exc: BaseException):
    yield exc
    if isinstance(exc, BaseExceptionGroup):
        for child in exc.exceptions:
            yield from _walk_exceptions(child)


def _is_auth_error(exc: BaseException) -> bool:
    return any(
        any(
            marker in str(item).lower()
            for marker in ("401", "403", "unauthorized", "forbidden")
        )
        for item in _walk_exceptions(exc)
    )


def _is_connectivity_error(exc: BaseException) -> bool:
    return any(
        isinstance(
            item,
            (
                asyncio.TimeoutError,
                ConnectionError,
                OSError,
                httpx.TransportError,
            ),
        )
        for item in _walk_exceptions(exc)
    )


def _map_connection_error(exc: BaseException):
    if _is_auth_error(exc):
        return McpAuthFailed("MCP rejected the delegated credential")
    return McpUnavailable("MCP connection failed")


def _map_initialize_error(exc: BaseException):
    if _is_auth_error(exc):
        return McpAuthFailed("MCP rejected the delegated credential")
    if _is_connectivity_error(exc):
        return McpUnavailable("MCP initialize timed out or disconnected")
    return McpProtocolError("MCP initialize failed")


def _map_discovery_error(exc: BaseException):
    if _is_auth_error(exc):
        return McpAuthFailed("MCP rejected the delegated credential")
    if _is_connectivity_error(exc):
        return McpUnavailable("MCP tool discovery timed out or disconnected")
    return McpToolDiscoveryFailed("MCP tool discovery failed")
