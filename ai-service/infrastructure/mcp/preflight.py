"""Mandatory MCP readiness probe used before an agent command is accepted."""

from __future__ import annotations

from collections.abc import Callable

from services.mcp_tool_provider import MCPToolProvider


class McpPreflight:
    def __init__(
        self,
        server_url: str,
        *,
        provider_factory: Callable[..., MCPToolProvider] = MCPToolProvider,
    ) -> None:
        self._server_url = server_url
        self._provider_factory = provider_factory

    async def check(self, mcp_token: str) -> None:
        provider = self._provider_factory(
            server_url=self._server_url,
            authorization_header=f"Bearer {mcp_token}",
        )
        await provider.probe()
