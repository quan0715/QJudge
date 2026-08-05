"""Application-facing boundary around the DeepAgent runtime."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

from application.artifacts import ArtifactService
from services.artifact_tools import build_artifact_tools
from services.mcp_tool_provider import MCPToolProvider


class AgentOperation(StrEnum):
    START = "start"
    RESUME = "resume"
    APPROVE = "approve"
    ANSWER = "answer"


@dataclass(frozen=True, slots=True)
class AgentCommand:
    run_id: UUID
    session_id: UUID
    operation: AgentOperation
    prompt: str | None
    model_id: str
    mcp_token: str
    approval: dict[str, Any] | None
    answer: str | None


class AgentRunner(Protocol):
    def execute(
        self,
        *,
        command: AgentCommand,
        tools: list[Any],
        configurable: dict[str, str],
    ) -> AsyncIterator[dict[str, Any]]: ...


class CheckpointIdentity(Protocol):
    def configurable(self, session_id: UUID) -> dict[str, str]: ...


class McpToolConnection(Protocol):
    def connect(
        self, mcp_token: str
    ) -> AbstractAsyncContextManager[list[Any]]: ...


class McpToolConnectionProvider:
    """Bind an exchanged MCP access token to the existing MCP provider."""

    def __init__(
        self,
        *,
        server_url: str,
        tool_policy: dict[str, Any] | None = None,
    ) -> None:
        self._server_url = server_url
        self._tool_policy = tool_policy

    @asynccontextmanager
    async def connect(self, mcp_token: str) -> AsyncIterator[list[Any]]:
        authorization = (
            mcp_token if mcp_token.startswith("Bearer ") else f"Bearer {mcp_token}"
        )
        async with MCPToolProvider(
            server_url=self._server_url,
            authorization_header=authorization,
            tool_policy=self._tool_policy,
        ) as provider:
            yield list(await provider.load_tools())


class DeepAgentAdapter:
    """Compose local ports and enforce domain-owned execution identifiers."""

    def __init__(
        self,
        *,
        runner: AgentRunner,
        mcp_provider: McpToolConnection,
        artifact_service: ArtifactService,
        checkpoint_store: CheckpointIdentity,
    ) -> None:
        self._runner = runner
        self._mcp_provider = mcp_provider
        self._artifact_service = artifact_service
        self._checkpoint_store = checkpoint_store

    async def execute(
        self, command: AgentCommand
    ) -> AsyncIterator[dict[str, Any]]:
        configurable = {
            **self._checkpoint_store.configurable(command.session_id),
            "run_id": str(command.run_id),
        }

        async with self._mcp_provider.connect(command.mcp_token) as mcp_tools:
            tools = [
                *mcp_tools,
                *build_artifact_tools(
                    session_id=command.session_id,
                    run_id=command.run_id,
                    artifact_service=self._artifact_service,
                ),
            ]
            async for raw_event in self._runner.execute(
                command=command,
                tools=tools,
                configurable=configurable,
            ):
                yield {**raw_event, "run_id": str(command.run_id)}
