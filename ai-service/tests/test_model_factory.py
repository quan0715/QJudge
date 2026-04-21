"""Tests for ModelFactory multi-provider wiring."""

from __future__ import annotations

import sys
import types


_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")


class _ChatDeepSeekStub:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _ChatOpenAIStub:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


_deepseek_stub.ChatDeepSeek = _ChatDeepSeekStub
_openai_stub.ChatOpenAI = _ChatOpenAIStub
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from services import model_factory as model_factory_mod  # noqa: E402


class _FakeSettings:
    deepseek_api_key = "deepseek-key"
    openai_api_key = "openai-key"


def test_create_model_openai_nano(monkeypatch):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    model = model_factory_mod.ModelFactory.create_model("openai-nano")
    assert isinstance(model, _ChatOpenAIStub)
    assert model.kwargs["model"] == "gpt-5-nano"
    assert model.kwargs["api_key"] == "openai-key"
    assert model.kwargs["streaming"] is True
    assert "reasoning_effort" not in model.kwargs


def test_create_model_openai_mini_sets_reasoning_effort(monkeypatch):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    model = model_factory_mod.ModelFactory.create_model("openai-mini")
    assert isinstance(model, _ChatOpenAIStub)
    assert model.kwargs["model"] == "gpt-5.4-mini"
    assert model.kwargs["api_key"] == "openai-key"
    assert model.kwargs["streaming"] is True
    # Must route via Responses API (gpt-5.x + tools + reasoning on
    # /v1/chat/completions is rejected by OpenAI).
    assert model.kwargs["reasoning"] == {"effort": "low", "summary": "auto"}
    assert model.kwargs["use_responses_api"] is True
    assert model.kwargs["output_version"] == "responses/v1"
    assert "reasoning_effort" not in model.kwargs


def test_create_model_openai_mini_medium_sets_medium_effort(monkeypatch):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    model = model_factory_mod.ModelFactory.create_model("openai-mini-medium")
    assert isinstance(model, _ChatOpenAIStub)
    assert model.kwargs["model"] == "gpt-5.4-mini"
    assert model.kwargs["reasoning"] == {"effort": "medium", "summary": "auto"}
    assert model.kwargs["use_responses_api"] is True
    assert model.kwargs["output_version"] == "responses/v1"


def test_create_model_deepseek_r1(monkeypatch):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    model = model_factory_mod.ModelFactory.create_model("deepseek-r1")
    assert isinstance(model, _ChatDeepSeekStub)
    assert model.kwargs["model"] == "deepseek-reasoner"
    assert model.kwargs["api_key"] == "deepseek-key"
    assert model.kwargs["streaming"] is True


def test_unknown_model_falls_back_to_default():
    assert model_factory_mod.ModelFactory.resolve_model_string("missing-model") == "gpt-5-nano"

