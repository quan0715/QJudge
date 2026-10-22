"""Subagents must not run QJudge write actions: they have no approval step."""

from __future__ import annotations

import asyncio
import sys
import types
from typing import Any
from unittest.mock import MagicMock

for _name, _cls in (("langchain_deepseek", "ChatDeepSeek"), ("langchain_openai", "ChatOpenAI")):
    _stub = types.ModuleType(_name)
    setattr(_stub, _cls, type(_cls, (), {}))
    sys.modules.setdefault(_name, _stub)

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel  # noqa: E402
from langchain_core.messages import AIMessage, ToolMessage  # noqa: E402
from langchain_core.tools import tool  # noqa: E402

from infrastructure.agent import deepagent_adapter as runner_mod  # noqa: E402

calls: list[dict[str, Any]] = []


@tool
def qjudge_grading(action: str, contest_id: str = "") -> str:
    """Grading tool stand-in."""
    calls.append({"action": action, "contest_id": contest_id})
    return f"{action} done"


class _ToolCallingFakeModel(GenericFakeChatModel):
    def bind_tools(self, tools: Any, **kwargs: Any) -> "_ToolCallingFakeModel":
        return self


def _script(subagent_action: str) -> _ToolCallingFakeModel:
    task_call = {
        "name": "task",
        "args": {"description": "批改 Q3", "subagent_type": "general-purpose"},
        "id": "call_task",
    }
    grading_call = {
        "name": "qjudge_grading",
        "args": {"action": subagent_action, "contest_id": "c1"},
        "id": "call_grade",
    }
    return _ToolCallingFakeModel(
        disable_streaming=True,
        messages=iter(
            [
                AIMessage(content="", tool_calls=[task_call]),
                AIMessage(content="", tool_calls=[grading_call]),
                AIMessage(content="子代理完成"),
                AIMessage(content="主代理完成"),
            ]
        ),
    )


def _run(subagent_action: str) -> list[Any]:
    calls.clear()
    adapter = runner_mod.DeepAgentAdapter(
        mcp_provider=MagicMock(),
        artifact_service=MagicMock(),
        checkpoint_store=MagicMock(),
        skills_paths=[],
        memory_paths=[],
    )
    agent = adapter._runner._build_agent(
        model=_script(subagent_action), system_prompt=None, tools=[qjudge_grading]
    )
    events: list[Any] = []

    async def collect() -> None:
        async for event in agent.astream_events(
            {"messages": [{"role": "user", "content": "go"}]}, version="v2"
        ):
            events.append(event)

    asyncio.run(collect())
    return events


def _grading_tool_messages(events: list[Any]) -> list[ToolMessage]:
    return [
        e["data"]["output"]
        for e in events
        if e["event"] == "on_tool_end"
        and isinstance(e["data"].get("output"), ToolMessage)
        and e["data"]["output"].tool_call_id == "call_grade"
    ]


def test_subagent_write_action_is_blocked_without_running_the_tool() -> None:
    events = _run("batch_grade")

    assert calls == []
    assert any(e["event"] == "on_tool_start" and e["name"] == "task" for e in events)


def test_subagent_read_action_still_runs() -> None:
    _run("question_detail")

    assert calls == [{"action": "question_detail", "contest_id": "c1"}]
