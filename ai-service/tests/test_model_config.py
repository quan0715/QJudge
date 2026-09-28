"""deploy/ai/models.yml parsing and validation."""

from __future__ import annotations

from pathlib import Path

import pytest

from domain.model_catalog import ModelConfigInvalid
from infrastructure.agent.model_config import load_model_config, main, parse_model_config

KEYS = {"OPENAI_API_KEY": "sk-openai", "DEEPSEEK_API_KEY": "sk-deepseek"}


def no_profile(kind: str, model: str) -> int | None:
    return None


def problems_of(data, env=KEYS, profile_lookup=no_profile) -> tuple[str, ...]:
    with pytest.raises(ModelConfigInvalid) as caught:
        parse_model_config(data, env, profile_lookup)
    return caught.value.problems


VLLM_ONLY = {
    "models": [{"id": "gemma4-31b", "provider": "lab-vllm", "model": "Gemma4-31B"}],
    "endpoints": {"lab-vllm": {"base_url": "http://10.0.0.5:8000/v1/"}},
}


def test_minimal_self_hosted_config_fills_defaults():
    config = parse_model_config(VLLM_ONLY, {}, no_profile)
    [spec] = config.models
    assert spec.model == "Gemma4-31B"
    assert spec.display_name == "gemma4-31b"
    assert spec.description == ""
    assert spec.max_input_tokens is None
    endpoint = config.endpoints["lab-vllm"]
    assert endpoint.kind == "openai_compatible"
    assert endpoint.base_url == "http://10.0.0.5:8000/v1"
    assert endpoint.api_key_env == "LAB_VLLM_API_KEY"
    assert config.default_id is None


def test_builtin_provider_needs_no_endpoint_and_uses_profile_limit():
    config = parse_model_config(
        {"models": [{"id": "gpt-5-nano", "provider": "openai"}]},
        KEYS,
        lambda kind, model: 400_000 if (kind, model) == ("openai", "gpt-5-nano") else None,
    )
    [spec] = config.models
    assert spec.model == "gpt-5-nano"
    assert spec.max_input_tokens == 400_000
    assert config.endpoints["openai"].base_url is None


def test_builtin_endpoint_can_override_base_url():
    config = parse_model_config(
        {
            "models": [{"id": "gpt", "provider": "openai", "max_input_tokens": 1000}],
            "endpoints": {"openai": {"base_url": "https://proxy.test/v1"}},
        },
        KEYS,
        no_profile,
    )
    assert config.endpoints["openai"].kind == "openai"
    assert config.endpoints["openai"].base_url == "https://proxy.test/v1"


def test_empty_file_is_an_empty_catalog(tmp_path: Path):
    path = tmp_path / "models.yml"
    path.write_text("# no models on this host\n")
    config = load_model_config(path, {}, no_profile)
    assert config.models == ()
    assert config.default_id is None


def test_missing_file_points_to_the_example(tmp_path: Path):
    with pytest.raises(ModelConfigInvalid) as caught:
        load_model_config(tmp_path / "models.yml", {}, no_profile)
    assert "models.example.yml" in caught.value.problems[0]


def test_invalid_yaml_is_reported(tmp_path: Path):
    path = tmp_path / "models.yml"
    path.write_text("models: [\n")
    with pytest.raises(ModelConfigInvalid) as caught:
        load_model_config(path, {}, no_profile)
    assert "invalid YAML" in caught.value.problems[0]


def test_missing_builtin_key_is_reported_once():
    problems = problems_of(
        {
            "models": [
                {"id": "a", "provider": "openai", "max_input_tokens": 1},
                {"id": "b", "provider": "openai", "max_input_tokens": 1},
            ]
        },
        env={},
    )
    assert problems == ("OPENAI_API_KEY: not set in deploy/ai/keys.env",)


def test_blank_builtin_key_counts_as_missing():
    problems = problems_of(
        {"models": [{"id": "a", "provider": "openai", "max_input_tokens": 1}]},
        env={"OPENAI_API_KEY": "  "},
    )
    assert problems == ("OPENAI_API_KEY: not set in deploy/ai/keys.env",)


def test_self_hosted_key_is_optional():
    parse_model_config(VLLM_ONLY, {}, no_profile)


def test_builtin_model_without_known_limit_needs_max_input_tokens():
    problems = problems_of({"models": [{"id": "deepseek-v4-flash", "provider": "deepseek"}]})
    assert problems == (
        "models[0] (deepseek-v4-flash).max_input_tokens: required; "
        "LangChain has no context limit for deepseek-v4-flash",
    )


def test_every_problem_is_reported_together():
    problems = problems_of(
        {
            "default": "missing",
            "extra": 1,
            "models": [
                {"id": "Bad ID", "provider": "openai"},
                {"id": "a", "provider": "nowhere"},
                {"id": "b", "provider": "lab", "reasoning_effort": "high"},
                {"id": "b", "provider": "lab"},
                {"id": "c", "provider": "openai", "max_input_tokens": 0, "colour": "red"},
                {"id": "d", "provider": "openai", "max_input_tokens": 1, "reasoning_effort": "max"},
            ],
            "endpoints": {"lab": {"base_url": "ftp://lab"}, "other": {}, "Bad": {"base_url": "http://x"}},
        }
    )
    assert problems == (
        "extra: unknown field",
        "endpoints.lab.base_url: must be an http(s) URL",
        "endpoints.other.base_url: required for a self-hosted endpoint",
        "endpoints.Bad: name may contain only lowercase letters, digits and -",
        "models[0].id: required; lowercase letters, digits, . and -, at most 50 characters",
        "models[1] (a).provider: must be openai, deepseek or a name under endpoints",
        "models[2] (b).provider: must be openai, deepseek or a name under endpoints",
        "models[3] (b).id: duplicate",
        "models[4] (c).colour: unknown field",
        "models[4] (c).max_input_tokens: must be a positive integer",
        "models[5] (d).reasoning_effort: must be one of low, medium, high",
        "default: 'missing' is not a model id in models",
    )


def test_self_hosted_models_reject_reasoning_effort():
    data = {
        "models": [{"id": "g", "provider": "lab", "reasoning_effort": "low"}],
        "endpoints": {"lab": {"base_url": "http://lab/v1"}},
    }
    assert problems_of(data) == (
        "models[0] (g).reasoning_effort: not supported by self-hosted endpoints",
    )


def test_invalid_default_type_is_a_configuration_problem():
    assert problems_of({"models": [], "default": ["m"]}) == (
        "default: must be a model id string",
    )


def test_malformed_url_is_a_configuration_problem():
    assert problems_of({"endpoints": {"lab": {"base_url": "http://[bad"}}}) == (
        "endpoints.lab.base_url: must be an http(s) URL",
    )


def test_cli_prints_problems_and_fails(tmp_path, monkeypatch, capsys):
    from config import get_settings

    path = tmp_path / "models.yml"
    path.write_text("models:\n  - id: a\n    provider: nowhere\n")
    monkeypatch.setenv("AI_MODELS_FILE", str(path))
    get_settings.cache_clear()
    try:
        assert main() == 1
    finally:
        get_settings.cache_clear()
    assert "models[0] (a).provider" in capsys.readouterr().err


def test_cli_accepts_valid_config(tmp_path, monkeypatch, capsys):
    from config import get_settings

    path = tmp_path / "models.yml"
    path.write_text("models: []\n")
    monkeypatch.setenv("AI_MODELS_FILE", str(path))
    get_settings.cache_clear()
    try:
        assert main() == 0
    finally:
        get_settings.cache_clear()
    assert "0 model(s)" in capsys.readouterr().out
