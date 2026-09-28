"""ModelFactory builds catalog models and stamps context limits."""

from __future__ import annotations

import pytest

from domain.model_catalog import ModelNotAvailable
from infrastructure.agent import model_factory as model_factory_mod
from infrastructure.agent.model_catalog import ModelCatalog
from infrastructure.agent.model_config import parse_model_config


class _Model:
    def __init__(self, profile=None):
        self.profile = profile


def _catalog(data, env):
    return ModelCatalog(parse_model_config(data, env, lambda kind, model: None), env=env)


@pytest.fixture
def built(monkeypatch):
    calls = {}

    def fake_build(endpoint, spec, api_key):
        calls.update(endpoint=endpoint, spec=spec, api_key=api_key)
        return _Model(profile={"tool_calling": True})

    monkeypatch.setattr(model_factory_mod, "build_chat_model", fake_build)
    return calls


def test_create_model_uses_endpoint_key_and_stamps_limits(built):
    catalog = _catalog(
        {
            "models": [{"id": "gemma4-31b", "provider": "lab-vllm", "model": "Gemma4-31B",
                        "max_input_tokens": 131072}],
            "endpoints": {"lab-vllm": {"base_url": "http://vllm.test/v1"}},
        },
        {"LAB_VLLM_API_KEY": "lab-key"},
    )
    model = model_factory_mod.ModelFactory.create_model("gemma4-31b", catalog=catalog)
    assert built["api_key"] == "lab-key"
    assert built["endpoint"].base_url == "http://vllm.test/v1"
    assert model.profile == {"tool_calling": True, "max_input_tokens": 131072}
    assert model._qjudge_model_id == "gemma4-31b"
    assert model._qjudge_model_name == "Gemma4-31B"
    assert model._qjudge_max_input_tokens == 131072
    assert model._qjudge_summarization_trim_tokens == 12_000
    assert model._qjudge_summarization_trigger_fraction == 0.70


def test_create_model_without_id_uses_catalog_default(built):
    catalog = _catalog(
        {
            "default": "b",
            "models": [
                {"id": "a", "provider": "openai", "max_input_tokens": 1},
                {"id": "b", "provider": "openai", "max_input_tokens": 1},
            ],
        },
        {"OPENAI_API_KEY": "k"},
    )
    model_factory_mod.ModelFactory.create_model(catalog=catalog)
    assert built["spec"].id == "b"


def test_create_model_rejects_unconfigured_id(built):
    catalog = _catalog({"models": []}, {})
    with pytest.raises(ModelNotAvailable):
        model_factory_mod.ModelFactory.create_model("openai-nano", catalog=catalog)
