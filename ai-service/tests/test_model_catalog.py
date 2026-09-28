"""Runtime catalog: availability, probing and the effective default."""

from __future__ import annotations

import logging
from pathlib import Path

import httpx
import pytest

from domain.model_catalog import EndpointSpec, ModelConfigInvalid, ModelNotAvailable
from infrastructure.agent.model_catalog import ModelCatalog, probe_max_model_len
from infrastructure.agent.model_config import parse_model_config

LAB = {"lab": {"base_url": "http://lab.test/v1"}}


class FakeProbe:
    def __init__(self, *results):
        self.results = list(results)
        self.calls = 0

    def __call__(self, endpoint, api_key):
        self.calls += 1
        result = self.results.pop(0) if len(self.results) > 1 else self.results[0]
        if isinstance(result, Exception):
            raise result
        return result


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def catalog(data, probe=None, clock=None, env=None):
    env = {"OPENAI_API_KEY": "k"} if env is None else env
    config = parse_model_config(data, env, lambda kind, model: None)
    return ModelCatalog(config, env=env, probe=probe or FakeProbe({}), clock=clock or Clock())


def test_explicit_limit_needs_no_probe():
    probe = FakeProbe(httpx.ConnectError("down"))
    c = catalog(
        {"models": [{"id": "g", "provider": "lab", "max_input_tokens": 1000}], "endpoints": LAB},
        probe=probe,
    )
    assert [m.max_input_tokens for m in c.available()] == [1000]
    assert probe.calls == 0


def test_self_hosted_limit_comes_from_one_probe_per_endpoint():
    probe = FakeProbe({"A": 4096, "B": 8192})
    c = catalog(
        {
            "models": [
                {"id": "a", "provider": "lab", "model": "A"},
                {"id": "b", "provider": "lab", "model": "B"},
            ],
            "endpoints": LAB,
        },
        probe=probe,
    )
    assert [(m.id, m.max_input_tokens) for m in c.available()] == [("a", 4096), ("b", 8192)]
    c.available()
    assert probe.calls == 1


def test_probe_failure_hides_only_that_endpoint_and_retries_after_a_minute(caplog):
    clock = Clock()
    probe = FakeProbe(httpx.ConnectError("down"), {"A": 4096})
    c = catalog(
        {
            "models": [
                {"id": "gpt", "provider": "openai", "max_input_tokens": 1000},
                {"id": "a", "provider": "lab", "model": "A"},
            ],
            "endpoints": LAB,
        },
        probe=probe,
        clock=clock,
    )
    with caplog.at_level(logging.WARNING):
        assert [m.id for m in c.available()] == ["gpt"]
    assert "http://lab.test/v1" in caplog.text
    clock.now += 59
    assert [m.id for m in c.available()] == ["gpt"]
    assert probe.calls == 1
    clock.now += 1
    assert [m.id for m in c.available()] == ["gpt", "a"]
    assert probe.calls == 2


def test_missing_model_does_not_hide_its_endpoint_neighbours():
    clock = Clock()
    probe = FakeProbe({"A": 4096}, {"A": 4096, "B": 8192})
    c = catalog(
        {
            "models": [
                {"id": "a", "provider": "lab", "model": "A"},
                {"id": "b", "provider": "lab", "model": "B"},
            ],
            "endpoints": LAB,
        },
        probe=probe,
        clock=clock,
    )
    assert [m.id for m in c.available()] == ["a"]
    assert [m.id for m in c.available()] == ["a"]
    assert probe.calls == 1
    clock.now += 60
    assert [m.id for m in c.available()] == ["a", "b"]
    assert probe.calls == 2


def test_configured_default_wins_when_available():
    c = catalog(
        {
            "default": "b",
            "models": [
                {"id": "a", "provider": "openai", "max_input_tokens": 1},
                {"id": "b", "provider": "openai", "max_input_tokens": 1},
            ],
        }
    )
    assert c.default_id() == "b"
    assert c.resolve(None).id == "b"


def test_unavailable_configured_default_falls_back_to_first_available():
    c = catalog(
        {
            "default": "lab-model",
            "models": [
                {"id": "lab-model", "provider": "lab", "model": "X"},
                {"id": "gpt", "provider": "openai", "max_input_tokens": 1},
            ],
            "endpoints": LAB,
        },
        probe=FakeProbe(httpx.ConnectError("down")),
    )
    assert c.default_id() == "gpt"
    assert c.resolve(None).id == "gpt"


def test_resolve_rejects_unknown_and_empty_catalog():
    c = catalog({"models": [{"id": "a", "provider": "openai", "max_input_tokens": 1}]})
    with pytest.raises(ModelNotAvailable):
        c.resolve("removed-model")
    empty = catalog({})
    assert empty.available() == []
    assert empty.default_id() is None
    with pytest.raises(ModelNotAvailable):
        empty.resolve(None)


def test_invalid_config_logs_once_and_blocks_use(tmp_path: Path, caplog):
    path = tmp_path / "models.yml"
    path.write_text("models:\n  - id: a\n    provider: nowhere\n")
    with caplog.at_level(logging.ERROR):
        c = ModelCatalog.load(path, env={})
    assert "models[0] (a).provider" in caplog.text
    assert c.problems
    assert c.default_id() is None
    with pytest.raises(ModelConfigInvalid):
        c.available()
    with pytest.raises(ModelConfigInvalid):
        c.resolve("a")


def test_api_key_reads_endpoint_env():
    c = catalog({"models": [{"id": "g", "provider": "lab", "max_input_tokens": 1}], "endpoints": LAB},
                env={"LAB_API_KEY": " lab-key "})
    spec = c.resolve("g")
    assert c.api_key(c.endpoint(spec)) == "lab-key"


def test_probe_reads_vllm_models_listing():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        return httpx.Response(200, json={"data": [
            {"id": "Gemma4-31B", "max_model_len": 131072},
            {"id": "no-limit"},
        ]})

    endpoint = EndpointSpec("lab", "openai_compatible", "http://lab.test/v1", "LAB_API_KEY")
    limits = probe_max_model_len(endpoint, "", transport=httpx.MockTransport(handler))
    assert limits == {"Gemma4-31B": 131072}
    assert seen == {"url": "http://lab.test/v1/models", "auth": "Bearer EMPTY"}


def test_probe_rejects_unexpected_payload():
    endpoint = EndpointSpec("lab", "openai_compatible", "http://lab.test/v1", "LAB_API_KEY")
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=["not", "a", "dict"]))
    with pytest.raises(ValueError):
        probe_max_model_len(endpoint, "k", transport=transport)
