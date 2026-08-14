"""Authoritative identifier contract for the DeepAgent boundary."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest

from infrastructure.agent.deepagent_adapter import (
    AgentCommand,
    AgentOperation,
    DeepAgentAdapter,
)


RUN_ID = UUID("11111111-1111-4111-8111-111111111111")
SESSION_ID = UUID("22222222-2222-4222-8222-222222222222")


class FakeRunner:
    def __init__(self) -> None:
        self.commands: list[AgentCommand] = []
        self.configurable: dict[str, str] | None = None
        self.tools: list[Any] = []

    async def execute(
        self,
        *,
        command: AgentCommand,
        tools: list[Any],
        configurable: dict[str, str],
    ) -> AsyncIterator[dict[str, Any]]:
        self.commands.append(command)
        self.configurable = configurable
        self.tools = tools
        yield {"type": "agent_message_delta", "content": "hello"}
        # The boundary must replace even a conflicting dependency-provided ID.
        yield {"type": "run_completed", "run_id": "generated-by-dependency"}


class FakeCheckpointStore:
    def __init__(self) -> None:
        self.thread_ids: list[str] = []

    def configurable(self, session_id: UUID) -> dict[str, str]:
        self.thread_ids.append(str(session_id))
        return {"thread_id": str(session_id)}


class FakeMcpProvider:
    def __init__(self) -> None:
        self.tokens: list[str] = []

    @asynccontextmanager
    async def connect(self, mcp_token: str):
        self.tokens.append(mcp_token)
        yield [object()]


class FakeArtifactService:
    pass


def command_for(operation: AgentOperation) -> AgentCommand:
    return AgentCommand(
        run_id=RUN_ID,
        session_id=SESSION_ID,
        operation=operation,
        prompt="hello" if operation is AgentOperation.START else None,
        model_id="deepseek-v4-flash",
        mcp_token="mcp-token",
        approval={"decisions": [{"type": "approve"}]}
        if operation in {AgentOperation.APPROVE, AgentOperation.RESUME}
        else None,
        answer="because" if operation is AgentOperation.ANSWER else None,
    )


@pytest.fixture
def adapter_parts():
    runner = FakeRunner()
    checkpoints = FakeCheckpointStore()
    mcp = FakeMcpProvider()
    adapter = DeepAgentAdapter(
        runner=runner,
        mcp_provider=mcp,
        artifact_service=FakeArtifactService(),
        checkpoint_store=checkpoints,
    )
    return adapter, runner, checkpoints, mcp


async def test_adapter_uses_domain_ids_for_run_and_checkpoint(adapter_parts) -> None:
    adapter, runner, checkpoints, mcp = adapter_parts
    command = command_for(AgentOperation.START)

    events = [event async for event in adapter.execute(command)]

    assert runner.configurable == {
        "thread_id": str(command.session_id),
        "run_id": str(command.run_id),
    }
    assert {event["run_id"] for event in events} == {str(command.run_id)}
    assert checkpoints.thread_ids == [str(command.session_id)]
    assert mcp.tokens == ["mcp-token"]
    assert "artifact_write" in {
        getattr(tool, "name", None) for tool in runner.tools
    }


@pytest.mark.parametrize(
    "operation",
    [AgentOperation.RESUME, AgentOperation.APPROVE, AgentOperation.ANSWER],
)
async def test_resume_operations_reuse_the_same_domain_ids(
    adapter_parts, operation: AgentOperation
) -> None:
    adapter, runner, checkpoints, _mcp = adapter_parts
    command = command_for(operation)

    events = [event async for event in adapter.execute(command)]

    assert runner.commands == [command]
    assert runner.configurable == {
        "thread_id": str(SESSION_ID),
        "run_id": str(RUN_ID),
    }
    assert checkpoints.thread_ids == [str(SESSION_ID)]
    assert all(event["run_id"] == str(RUN_ID) for event in events)


def test_runner_source_does_not_generate_domain_ids() -> None:
    source = Path("infrastructure/agent/deepagent_adapter.py").read_text()
    assert "uuid.uuid4" not in source
    assert "uuid4(" not in source
    assert "backend_base_url" not in source
    assert "AI_SERVICE_INTERNAL_TOKEN" not in source
