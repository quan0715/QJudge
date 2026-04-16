"""MCP-backed tool loading for DeepAgent."""

from __future__ import annotations

from contextlib import AsyncExitStack
import logging
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.types import CallToolResult, Tool

logger = logging.getLogger(__name__)


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
        await session.initialize()

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
        session = self._require_session()
        tools: list[Tool] = []
        cursor: str | None = None

        while True:
            result = await session.list_tools(cursor=cursor)
            tools.extend(result.tools)
            cursor = result.nextCursor
            if not cursor:
                break

        return [self._build_langchain_tool(tool) for tool in tools]

    def _build_langchain_tool(self, tool_def: Tool) -> BaseTool:
        description = tool_def.description or f"MCP tool: {tool_def.name}"
        args_schema = tool_def.inputSchema or {"type": "object", "properties": {}}

        async def _invoke(**kwargs: Any) -> Any:
            result = await self._call_tool(tool_def.name, kwargs or None)
            formatted = _format_tool_result(result)
            logger.info("mcp_tool %s error=%s", tool_def.name, result.isError)
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
        session = self._require_session()
        return await session.call_tool(tool_name, arguments=arguments)

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
