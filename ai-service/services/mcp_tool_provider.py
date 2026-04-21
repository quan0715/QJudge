"""MCP-backed tool loading for DeepAgent."""

from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
import logging
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.types import CallToolResult, Tool

from config import get_settings

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
    ) -> None:
        self._server_url = server_url
        self._authorization_header = authorization_header
        self._stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None

    async def __aenter__(self) -> "MCPToolProvider":
        settings = get_settings()
        stack = AsyncExitStack()
        headers: dict[str, str] = {}
        if self._authorization_header:
            headers["Authorization"] = self._authorization_header

        read_stream, write_stream, _ = await stack.enter_async_context(
            streamablehttp_client(
                self._server_url,
                headers=headers or None,
            )
        )
        session = ClientSession(read_stream, write_stream)
        await stack.enter_async_context(session)
        await asyncio.wait_for(
            session.initialize(),
            timeout=max(0.5, settings.mcp_initialize_timeout_seconds),
        )

        self._stack = stack
        self._session = session
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
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
        settings = get_settings()
        session = self._require_session()
        tools: list[Tool] = []
        cursor: str | None = None

        while True:
            result = await asyncio.wait_for(
                session.list_tools(cursor=cursor),
                timeout=max(0.5, settings.mcp_list_tools_timeout_seconds),
            )
            tools.extend(result.tools)
            cursor = result.nextCursor
            if not cursor:
                break

        return [self._build_langchain_tool(tool) for tool in tools]

    def _build_langchain_tool(self, tool_def: Tool) -> BaseTool:
        description = tool_def.description or f"MCP tool: {tool_def.name}"
        args_schema = tool_def.inputSchema or {"type": "object", "properties": {}}

        async def _invoke(**kwargs: Any) -> Any:
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
