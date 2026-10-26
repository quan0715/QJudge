"""The canonical grading SOP and principles reach parent and delegated requests."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_core.tools import StructuredTool

from infrastructure.agent import deepagent_adapter as runner_mod
from infrastructure.agent.provider_adapters import HistoryCompatibleChatOpenAI


seen: list[list[BaseMessage]] = []


class RecordingModel(GenericFakeChatModel):
    def bind_tools(self, tools: Any, **kwargs: Any) -> RecordingModel:
        return self

    def _generate(self, messages: list[BaseMessage], *args: Any, **kwargs: Any) -> Any:
        seen.append(list(messages))
        return super()._generate(messages, *args, **kwargs)


def build_agent(tool_name: str):
    tool = StructuredTool.from_function(
        func=lambda: "available", name=tool_name, description="Read grading data."
    )
    model = RecordingModel(
        disable_streaming=True,
        messages=iter([
            AIMessage(content="", tool_calls=[{
                "name": "task", "id": "delegate-grading",
                "args": {"description": "Review the delegated answers.", "subagent_type": "general-purpose"},
            }]),
            AIMessage(content="Delegated review complete."),
            AIMessage(content="Review complete."),
        ]),
    )
    adapter = runner_mod.DeepAgentAdapter(
        mcp_provider=MagicMock(), artifact_service=MagicMock(),
        checkpoint_store=MagicMock(),
    )
    return adapter._runner._build_agent(model=model, system_prompt=None, tools=[tool])


@pytest.mark.parametrize("tool_name", ["get_grading_unit", "qjudge_grading"])
async def test_parent_and_subagent_receive_the_same_canonical_sop_and_principles_once(
    monkeypatch, tmp_path, tool_name,
):
    source = tmp_path / "principles.md"
    principles = "Canonical grading instructions supplied by the existing SOP."
    source.write_text(principles, encoding="utf-8")
    monkeypatch.setattr(runner_mod, "_GRADING_PRINCIPLES_PATH", source, raising=False)
    sop_source = tmp_path / "SKILL.md"
    sop = "Canonical grading workflow supplied by the existing skill."
    sop_source.write_text(sop, encoding="utf-8")
    monkeypatch.setattr(runner_mod, "_GRADING_SOP_PATH", sop_source, raising=False)
    seen.clear()

    result = await build_agent(tool_name).ainvoke({
        "messages": [{"role": "user", "content": "Review these answers."}],
    })

    assert result["messages"][-1].content == "Review complete."
    assert any(messages[-1].content == "Review the delegated answers." for messages in seen)
    assert len(seen) >= 3
    serializer = HistoryCompatibleChatOpenAI(model="test-model", api_key="test-key")
    for messages in seen:
        system = "\n".join(str(m.content) for m in messages if isinstance(m, SystemMessage))
        assert system.count(principles) == 1
        assert system.count(sop) == 1
        wire = serializer._get_request_payload(messages)["messages"]
        assert not any(m["role"] in {"system", "developer"} for m in wire)
        assert wire[0]["role"] == "user"
        assert str(wire[0]["content"]).count(sop) == 1
        assert str(wire[0]["content"]).count(principles) == 1


@pytest.mark.parametrize("content", [None, "", "  \n"])
@pytest.mark.parametrize("missing_source", ["SOP", "PRINCIPLES"])
def test_grading_cannot_start_without_its_canonical_instructions(
    monkeypatch, tmp_path, content, missing_source,
):
    for name in ["SOP", "PRINCIPLES"]:
        source = tmp_path / f"{name}.md"
        value = content if name == missing_source else "Existing grading instructions."
        if value is not None:
            source.write_text(value, encoding="utf-8")
        monkeypatch.setattr(runner_mod, f"_GRADING_{name}_PATH", source, raising=False)

    with pytest.raises(RuntimeError, match="[Gg]rading"):
        build_agent("get_grading_unit")


def test_non_grading_agent_does_not_require_grading_principles(monkeypatch, tmp_path):
    monkeypatch.setattr(
        runner_mod, "_GRADING_PRINCIPLES_PATH", tmp_path / "missing.md", raising=False,
    )
    monkeypatch.setattr(
        runner_mod, "_GRADING_SOP_PATH", tmp_path / "missing-sop.md", raising=False,
    )

    assert build_agent("qjudge_exam") is not None
