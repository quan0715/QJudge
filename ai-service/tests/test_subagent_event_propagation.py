"""Subagent (deepagents `task`) events must reach the parent run's stream."""

from __future__ import annotations

import asyncio
from typing import Any

from deepagents import create_deep_agent
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import tool


class _ToolCallingFakeModel(GenericFakeChatModel):
    def bind_tools(self, tools: Any, **kwargs: Any) -> "_ToolCallingFakeModel":
        return self


@tool
def echo_tool(text: str) -> str:
    """Echo the given text."""
    return text


def _scripted_model() -> _ToolCallingFakeModel:
    return _ToolCallingFakeModel(
        disable_streaming=True,
        messages=iter(
            [
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "task",
                            "args": {
                                "description": "批改 Q3",
                                "subagent_type": "general-purpose",
                            },
                            "id": "call_task",
                        }
                    ],
                ),
                AIMessage(
                    content="",
                    tool_calls=[
                        {"name": "echo_tool", "args": {"text": "hi"}, "id": "call_echo"}
                    ],
                ),
                AIMessage(content="子代理完成"),
                AIMessage(content="主代理完成"),
            ]
        )
    )


async def _collect_events() -> list[dict[str, Any]]:
    agent = create_deep_agent(model=_scripted_model(), tools=[echo_tool])
    return [
        event
        async for event in agent.astream_events(
            {"messages": [{"role": "user", "content": "go"}]},
            version="v2",
        )
    ]


def test_subagent_events_carry_task_run_id_in_parent_ids() -> None:
    events = asyncio.run(_collect_events())

    task_start = next(
        e for e in events if e["event"] == "on_tool_start" and e["name"] == "task"
    )
    echo_start = next(
        e for e in events if e["event"] == "on_tool_start" and e["name"] == "echo_tool"
    )
    assert task_start["run_id"] in echo_start["parent_ids"]
