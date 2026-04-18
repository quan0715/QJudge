"""Tests for DeepAgentRunner skill/memory integration wiring."""

from __future__ import annotations

import logging
import sys
import types
from unittest.mock import MagicMock

_deepseek_stub = types.ModuleType("langchain_deepseek")


class _ChatDeepSeekStub:  # pragma: no cover - import stub only
    pass


_deepseek_stub.ChatDeepSeek = _ChatDeepSeekStub
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)

from deepagents.backends.composite import CompositeBackend

from services import deepagent_runner as runner_mod


def test_summarization_middleware_is_patched():
    assert runner_mod._deepagents_graph.SummarizationMiddleware is runner_mod._SafeSummarizationMiddleware


class _CaptureCreateDeepAgent:
    def __init__(self):
        self.kwargs = None

    def __call__(self, **kwargs):
        self.kwargs = kwargs
        return {"ok": True}


def _patch_builder_dependencies(monkeypatch):
    capture = _CaptureCreateDeepAgent()

    def _fake_model_factory(model_id: str):
        return f"model:{model_id}"

    monkeypatch.setattr(runner_mod, "create_deep_agent", capture)
    monkeypatch.setattr(runner_mod.ModelFactory, "create_model", staticmethod(_fake_model_factory))
    monkeypatch.setattr(
        runner_mod,
        "_SafeSummarizationMiddleware",
        lambda *args, **kwargs: {"kind": "summarization", "kwargs": kwargs},
    )
    return capture


def test_build_agent_passes_default_skill_and_memory_paths(monkeypatch):
    capture = _patch_builder_dependencies(monkeypatch)
    runner = runner_mod.DeepAgentRunner(
        checkpoint_db_url="",
        mcp_server_url="http://example.test/mcp",
    )

    runner._build_agent(
        model_id="deepseek-r1",
        system_prompt=None,
        tools=[],
        event_queue=None,
    )

    assert capture.kwargs is not None
    assert capture.kwargs["skills"] == ["/app/.deepagents/skills/"]
    assert capture.kwargs["memory"] == ["/app/.deepagents/AGENTS.md"]
    backend_factory = capture.kwargs["backend"]
    assert callable(backend_factory)
    assert isinstance(backend_factory(MagicMock()), CompositeBackend)


def test_build_agent_default_system_prompt_key_phrases(monkeypatch):
    capture = _patch_builder_dependencies(monkeypatch)
    runner = runner_mod.DeepAgentRunner(
        checkpoint_db_url="",
        mcp_server_url="http://example.test/mcp",
    )

    runner._build_agent(
        model_id="deepseek-r1",
        system_prompt=None,
        tools=[],
        event_queue=None,
    )

    prompt = capture.kwargs["system_prompt"]
    assert "HITL 核准結果為準" in prompt
    assert "無關" in prompt
    assert "AGENTS.md" in prompt
    assert "qjudge-ta-protocol" in prompt


def test_build_agent_respects_custom_skill_and_memory_paths(monkeypatch):
    capture = _patch_builder_dependencies(monkeypatch)
    runner = runner_mod.DeepAgentRunner(
        checkpoint_db_url="",
        mcp_server_url="http://example.test/mcp",
        skills_paths=["/tmp/custom-skills"],
        memory_paths=["/tmp/custom-agents.md"],
    )

    runner._build_agent(
        model_id="deepseek-r1",
        system_prompt="custom-prompt",
        tools=[],
        event_queue=None,
    )

    assert capture.kwargs is not None
    assert capture.kwargs["skills"] == ["/tmp/custom-skills"]
    assert capture.kwargs["memory"] == ["/tmp/custom-agents.md"]
    assert capture.kwargs["system_prompt"] == "custom-prompt"


def test_build_agent_warns_when_skill_or_memory_path_missing(monkeypatch, caplog):
    capture = _patch_builder_dependencies(monkeypatch)
    missing_skill = "/tmp/definitely-missing-qjudge-skill-dir"
    missing_memory = "/tmp/definitely-missing-qjudge-agents.md"
    runner = runner_mod.DeepAgentRunner(
        checkpoint_db_url="",
        mcp_server_url="http://example.test/mcp",
        skills_paths=[missing_skill],
        memory_paths=[missing_memory],
    )

    with caplog.at_level(logging.WARNING):
        runner._build_agent(
            model_id="deepseek-r1",
            system_prompt=None,
            tools=[],
            event_queue=None,
        )

    assert capture.kwargs is not None
    warning_text = "\n".join(caplog.messages)
    assert f"DeepAgents path not found: {missing_skill}" in warning_text
    assert f"DeepAgents path not found: {missing_memory}" in warning_text
