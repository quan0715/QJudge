"""A tool that raises sends the error back to the model instead of failing the run."""

from __future__ import annotations

import asyncio
import sys
import types
from typing import Any
from unittest.mock import MagicMock

import pytest

for _name, _cls in (("langchain_deepseek", "ChatDeepSeek"), ("langchain_openai", "ChatOpenAI")):
    _stub = types.ModuleType(_name)
    setattr(_stub, _cls, type(_cls, (), {}))
    sys.modules.setdefault(_name, _stub)

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel  # noqa: E402
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage  # noqa: E402
from langchain_core.tools import StructuredTool  # noqa: E402

from domain.ports import McpAuthFailed  # noqa: E402
from infrastructure.agent import deepagent_adapter as runner_mod  # noqa: E402

seen: list[list[BaseMessage]] = []


class _RecordingModel(GenericFakeChatModel):
    def bind_tools(self, tools: Any, **kwargs: Any) -> "_RecordingModel":
        return self

    async def _agenerate(self, messages: list[BaseMessage], *args: Any, **kwargs: Any) -> Any:
        seen.append(list(messages))
        return await super()._agenerate(messages, *args, **kwargs)

    def _generate(self, messages: list[BaseMessage], *args: Any, **kwargs: Any) -> Any:
        seen.append(list(messages))
        return super()._generate(messages, *args, **kwargs)


def _read_tool(error: Exception | None = None) -> StructuredTool:
    async def _read(filename: str) -> str:
        if error:
            raise error
        return f"content of {filename}"

    # A JSON-schema dict is not validated by LangChain, like the artifact tools.
    return StructuredTool(
        name="artifact_read",
        description="Read an artifact.",
        args_schema={
            "type": "object",
            "properties": {"filename": {"type": "string"}},
            "required": ["filename"],
        },
        coroutine=_read,
    )


def _run(read_args: dict[str, Any], tool: StructuredTool) -> None:
    seen.clear()
    model = _RecordingModel(
        disable_streaming=True,
        messages=iter(
            [
                AIMessage(content="", tool_calls=[{
                    "name": "task", "id": "call_task",
                    "args": {"description": "批改 Q4", "subagent_type": "general-purpose"},
                }]),
                AIMessage(content="", tool_calls=[{"name": "artifact_read", "id": "call_read", "args": read_args}]),
                AIMessage(content="子代理完成"),
                AIMessage(content="主代理完成"),
            ]
        ),
    )
    adapter = runner_mod.DeepAgentAdapter(
        mcp_provider=MagicMock(),
        artifact_service=MagicMock(),
        checkpoint_store=MagicMock(),
        skills_paths=[],
        memory_paths=[],
    )
    agent = adapter._runner._build_agent(model=model, system_prompt=None, tools=[tool])
    asyncio.run(agent.ainvoke({"messages": [{"role": "user", "content": "go"}]}))


def _error_feedback() -> list[ToolMessage]:
    return [
        message
        for messages in seen
        for message in messages
        if isinstance(message, ToolMessage) and message.tool_call_id == "call_read" and message.status == "error"
    ]


def test_wrong_tool_arguments_reach_the_subagent_as_an_error() -> None:
    _run({"file_path": "context.json"}, _read_tool())

    feedback = _error_feedback()
    assert feedback, "the subagent never saw the tool error"
    assert "file_path" in str(feedback[0].content)


def test_a_failing_tool_reaches_the_subagent_as_an_error() -> None:
    _run({"filename": "context.json"}, _read_tool(ValueError("storage hiccup")))

    assert "storage hiccup" in str(_error_feedback()[0].content)


def test_mcp_auth_failure_still_stops_the_run() -> None:
    with pytest.raises(McpAuthFailed):
        _run({"filename": "context.json"}, _read_tool(McpAuthFailed("expired")))
