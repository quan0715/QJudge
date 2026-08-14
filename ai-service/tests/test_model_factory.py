"""Tests for ModelFactory multi-provider wiring."""

from __future__ import annotations

import pytest

from infrastructure.agent import model_factory as model_factory_mod


class _ChatDeepSeekStub:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _ReasoningPreservingChatDeepSeekStub(_ChatDeepSeekStub):
    pass


class _ChatOpenAIStub:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


@pytest.fixture(autouse=True)
def _stub_provider_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(model_factory_mod, "TpmGatedChatOpenAI", _ChatOpenAIStub)
    monkeypatch.setattr(model_factory_mod, "ChatDeepSeek", _ChatDeepSeekStub)
    monkeypatch.setattr(
        model_factory_mod,
        "ReasoningPreservingChatDeepSeek",
        _ReasoningPreservingChatDeepSeekStub,
    )


class _FakeSettings:
    deepseek_api_key = "deepseek-key"
    openai_api_key = "openai-key"
    deepseek_base_url = ""
    openai_base_url = ""


def test_create_model_openai_nano(monkeypatch):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    model = model_factory_mod.ModelFactory.create_model("openai-nano")
    assert isinstance(model, _ChatOpenAIStub)
    assert model.kwargs["model"] == "gpt-5-nano"
    assert model.kwargs["api_key"] == "openai-key"
    assert model.kwargs["streaming"] is True
    assert "reasoning_effort" not in model.kwargs
    # nano has no TPM pressure; no rate limiter.
    assert "rate_limiter" not in model.kwargs


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
    # TPM protection.
    rate_limiter = model.kwargs.get("rate_limiter")
    assert rate_limiter is not None
    assert rate_limiter.requests_per_second == 2.0


def test_create_model_openai_mini_medium_sets_medium_effort(monkeypatch):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    model = model_factory_mod.ModelFactory.create_model("openai-mini-medium")
    assert isinstance(model, _ChatOpenAIStub)
    assert model.kwargs["model"] == "gpt-5.4-mini"
    assert model.kwargs["reasoning"] == {"effort": "medium", "summary": "auto"}
    assert model.kwargs["use_responses_api"] is True
    assert model.kwargs["output_version"] == "responses/v1"
    rate_limiter = model.kwargs.get("rate_limiter")
    assert rate_limiter is not None
    assert rate_limiter.requests_per_second == 2.0


@pytest.mark.parametrize(
    ("model_id", "provider_model"),
    [
        ("deepseek-v4-flash", "deepseek-v4-flash"),
        ("deepseek-v4-pro", "deepseek-v4-pro"),
    ],
)
def test_create_model_canonical_deepseek_v4_uses_thinking_client(
    monkeypatch,
    model_id,
    provider_model,
):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    model = model_factory_mod.ModelFactory.create_model(model_id)

    assert isinstance(model, _ReasoningPreservingChatDeepSeekStub)
    assert model.kwargs["model"] == provider_model
    assert model.kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
    assert model.kwargs["reasoning_effort"] == "high"


def test_model_ids_match_factory_registry():
    from domain.model_registry import MODEL_IDS

    assert MODEL_IDS == frozenset(model_factory_mod._MODEL_MAP)


def test_unknown_model_is_rejected():
    with pytest.raises(ValueError, match="Unsupported model_id: missing-model"):
        model_factory_mod.ModelFactory.resolve_model_string("missing-model")


def test_create_model_rejects_legacy_model_id(monkeypatch):
    monkeypatch.setattr(model_factory_mod, "get_settings", lambda: _FakeSettings())
    with pytest.raises(ValueError, match="Unsupported model_id: deepseek-v4"):
        model_factory_mod.ModelFactory.create_model("deepseek-v4")
