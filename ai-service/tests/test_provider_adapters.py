"""Built-in provider adapters map ModelSpec settings onto LangChain clients."""

from __future__ import annotations

import pytest

from domain.model_catalog import EndpointSpec, ModelSpec, api_key_env_name
from infrastructure.agent import provider_adapters


class _Client:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _ReasoningClient(_Client):
    pass


@pytest.fixture(autouse=True)
def _stub_clients(monkeypatch):
    monkeypatch.setattr(provider_adapters, "ChatOpenAI", _Client)
    monkeypatch.setattr(provider_adapters, "ChatDeepSeek", _Client)
    monkeypatch.setattr(provider_adapters, "ReasoningPreservingChatDeepSeek", _ReasoningClient)


def _spec(**changes) -> ModelSpec:
    values = {
        "id": "m",
        "provider": "openai",
        "model": "gpt-5-nano",
        "display_name": "m",
        "description": "",
        "reasoning_effort": None,
        "max_input_tokens": 400_000,
    }
    values.update(changes)
    return ModelSpec(**values)


def _endpoint(name: str, kind: str, base_url: str | None = None) -> EndpointSpec:
    return EndpointSpec(name, kind, base_url, api_key_env_name(name))


def test_api_key_env_name_uppercases_and_replaces_dashes():
    assert api_key_env_name("lab-vllm") == "LAB_VLLM_API_KEY"
    assert api_key_env_name("openai") == "OPENAI_API_KEY"


def test_openai_without_reasoning_uses_chat_completions():
    model = provider_adapters.build_chat_model(_endpoint("openai", "openai"), _spec(), "key")
    assert model.kwargs == {
        "model": "gpt-5-nano",
        "api_key": "key",
        "streaming": True,
        "max_retries": 6,
    }


def test_openai_reasoning_routes_through_responses_api():
    model = provider_adapters.build_chat_model(
        _endpoint("openai", "openai", "https://proxy.test/v1"),
        _spec(model="gpt-6-luna", reasoning_effort="medium", max_input_tokens=272_000),
        "key",
    )
    assert model.kwargs["base_url"] == "https://proxy.test/v1"
    assert model.kwargs["model"] == "gpt-6-luna"
    assert model.kwargs["reasoning"] == {"effort": "medium", "summary": "auto"}
    assert model.kwargs["use_responses_api"] is True
    assert model.kwargs["output_version"] == "responses/v1"


def test_openai_compatible_without_key_sends_empty_placeholder():
    model = provider_adapters.build_chat_model(
        _endpoint("lab-vllm", "openai_compatible", "http://vllm.test/v1"),
        _spec(provider="lab-vllm", model="Gemma4-31B"),
        "",
    )
    assert model.kwargs["api_key"] == "EMPTY"
    assert model.kwargs["base_url"] == "http://vllm.test/v1"
    assert "reasoning" not in model.kwargs


def test_deepseek_reasoning_enables_thinking_with_preserving_client():
    model = provider_adapters.build_chat_model(
        _endpoint("deepseek", "deepseek"),
        _spec(provider="deepseek", model="deepseek-flash", reasoning_effort="high"),
        "key",
    )
    assert isinstance(model, _ReasoningClient)
    assert model.kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
    assert model.kwargs["reasoning_effort"] == "high"


def test_deepseek_without_reasoning_disables_thinking():
    model = provider_adapters.build_chat_model(
        _endpoint("deepseek", "deepseek", "https://ds.test"),
        _spec(provider="deepseek", model="deepseek-flash"),
        "key",
    )
    assert type(model) is _Client
    assert model.kwargs["extra_body"] == {"thinking": {"type": "disabled"}}
    assert model.kwargs["api_base"] == "https://ds.test"
    assert "reasoning_effort" not in model.kwargs


def test_builtin_max_input_tokens_reads_langchain_profile(monkeypatch):
    class _Profiled:
        def __init__(self, **kwargs):
            self.profile = {"max_input_tokens": 400_000} if kwargs["model"] == "gpt-5-nano" else {}

    monkeypatch.setattr(provider_adapters, "ChatOpenAI", _Profiled)
    assert provider_adapters.builtin_max_input_tokens("openai", "gpt-5-nano") == 400_000
    assert provider_adapters.builtin_max_input_tokens("openai", "unknown") is None
    assert provider_adapters.builtin_max_input_tokens("openai_compatible", "x") is None
