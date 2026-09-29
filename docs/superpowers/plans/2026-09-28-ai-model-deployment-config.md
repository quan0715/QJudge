# AI 模型部署配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓每台 QJudge 機器以 `deploy/ai/models.yml` 決定可用的 AI 模型，程式碼只保留內建 provider 的呼叫方式；設定有誤時服務照常啟動，前端顯示對應訊息。

**Architecture:** ai-service 新增三層：`provider_adapters`（程式碼持有的 OpenAI／DeepSeek／OpenAI 相容呼叫方式）、`model_config`（解析並驗證 YAML，一次列出全部問題）、`model_catalog`（process 內的執行期目錄：解析 context 上限、探測自架 endpoint、決定有效預設）。`ModelFactory`、API、Django BFF、前端都改從目錄取得模型與預設值，移除所有寫死的 model ID。部署端以目錄掛載 `deploy/ai/`，`qjudge upgrade` 在停機前以新 image 驗證設定。

**Tech Stack:** Python 3 / FastAPI / pydantic-settings / PyYAML / httpx / LangChain（ai-service）、Django REST Framework（backend）、React + Carbon + vitest + i18next（frontend）、Docker Compose 與 stdlib-only `deploy/qjudge_cli`。

**Spec:** `docs/superpowers/specs/2026-09-28-ai-model-deployment-config-design.md`

## Global Constraints

- 在 feature branch 上實作（依 `qjudge-github-workflow-owner`），不要直接 commit 到 `dev`。
- 本機 Compose 一律經由 `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ...`；`down` 絕不加 `-v`。
- ai-service 測試：`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q <paths>`（下文簡寫為 `AI_PYTEST <paths>`）。
- backend 不需 DB 的測試：`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python -m pytest -q --ds=config.settings.test <paths>`（簡寫 `BE_PYTEST <paths>`）。
- 部署 CLI 測試在 host：`python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`。`deploy/qjudge_cli` 只能用 Python 標準函式庫。
- 前端測試：`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npx vitest run <paths>`（簡寫 `FE_VITEST <paths>`）。
- 內建 provider 只有 `openai`、`deepseek`；自架 endpoint 一律 `openai_compatible`。
- API key env 名稱：`provider.upper().replace("-", "_") + "_API_KEY"`；空字串視為未設定。
- 設定檔路徑：容器內 `/etc/qjudge-ai/models.yml`（`AI_MODELS_FILE` 可覆蓋）；主機 `deploy/ai/models.yml`、`deploy/ai/keys.env`。
- 錯誤碼：`MODEL_CONFIG_INVALID`（503）、`MODEL_NOT_AVAILABLE`（422）。
- 摘要常數：`SUMMARIZATION_TRIGGER_FRACTION = 0.70`、`SUMMARY_TRIM_TOKENS = 12_000`；自架探測重試間隔 60 秒、逾時 3 秒；adapter `max_retries = 6`。
- 前端訊息（zh-TW）逐字：
  - `aiModelConfigInvalid`：AI 模型設定有誤，AI 功能暫時無法使用。請聯絡站台管理員檢查 AI 模型設定。
  - `aiNoModelsConfigured`：此站台尚未設定 AI 模型，請聯絡站台管理員。
  - `aiModelNotAvailable`：所選模型目前無法使用，模型清單已重新整理，請改選其他模型後再送出。
- UI 一律用 Carbon 元件；不新增模型定價或 credit 邏輯。

## Review Focus

1. **`models.yml` 是空檔案或只有註解**（`yaml.safe_load` 回傳 `None`）：應視為空目錄（AI 停用、不是設定錯誤）。→ Task 2 `test_empty_file_is_an_empty_catalog`。
2. **`default` 指向的自架模型暫時連不到**：有效預設應改為第一個可用模型，而不是讓所有未指定模型的 run 失敗。→ Task 3 `test_unavailable_configured_default_falls_back_to_first_available`。
3. **`keys.env` 有 `OPENAI_API_KEY=`（空值）**：視為未設定並報錯，而不是帶空 key 呼叫 provider。→ Task 2 `test_blank_builtin_key_counts_as_missing`。
4. **Django 未帶 `model_id` 時轉送 JSON `null`**：ai-service 應接受並使用預設，而不是 422。→ Task 5 `test_start_run_accepts_null_model_id_and_uses_default`。
5. **同一個自架 endpoint 上有兩個模型、其中一個不在 `/models` 清單**：另一個模型仍可用，且 60 秒內不重複探測。→ Task 3 `test_missing_model_does_not_hide_its_endpoint_neighbours`。

---

### Task 1: 內建 provider adapter 與目錄型別

**Files:**
- Create: `ai-service/domain/model_catalog.py`
- Create: `ai-service/infrastructure/agent/provider_adapters.py`
- Test: `ai-service/tests/test_provider_adapters.py`

**Interfaces:**
- Produces:
  - `domain.model_catalog.EndpointSpec(name: str, kind: str, base_url: str | None, api_key_env: str)`（frozen dataclass；`kind` ∈ `"openai" | "deepseek" | "openai_compatible"`）
  - `domain.model_catalog.ModelSpec(id, provider, model, display_name, description: str, reasoning_effort: str | None, max_input_tokens: int | None)`
  - `domain.model_catalog.ModelConfig(models: tuple[ModelSpec, ...], endpoints: dict[str, EndpointSpec], default_id: str | None)`
  - `domain.model_catalog.ModelConfigInvalid(problems: Iterable[str])`，屬性 `problems: tuple[str, ...]`、`code = "MODEL_CONFIG_INVALID"`
  - `domain.model_catalog.ModelNotAvailable(model_id: str | None)`，`code = "MODEL_NOT_AVAILABLE"`
  - `domain.model_catalog.api_key_env_name(provider: str) -> str`
  - `provider_adapters.BUILTIN_PROVIDERS: frozenset[str]`、`OPENAI_COMPATIBLE = "openai_compatible"`、`MAX_RETRIES = 6`
  - `provider_adapters.builtin_max_input_tokens(kind: str, model: str) -> int | None`
  - `provider_adapters.build_chat_model(endpoint: EndpointSpec, spec: ModelSpec, api_key: str) -> Any`
  - `provider_adapters.ReasoningPreservingChatDeepSeek`（自 `model_factory.py` 原樣搬移）

- [ ] **Step 1: 寫 domain 型別**

`ai-service/domain/model_catalog.py`：

```python
"""Deployment model catalog types shared by config loading and runtime."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class EndpointSpec:
    """Where and how to reach one provider."""

    name: str
    kind: str  # "openai" | "deepseek" | "openai_compatible"
    base_url: str | None
    api_key_env: str


@dataclass(frozen=True)
class ModelSpec:
    """One model a deployment offers, as written in deploy/ai/models.yml."""

    id: str
    provider: str
    model: str
    display_name: str
    description: str
    reasoning_effort: str | None
    max_input_tokens: int | None


@dataclass(frozen=True)
class ModelConfig:
    models: tuple[ModelSpec, ...]
    endpoints: dict[str, EndpointSpec]
    default_id: str | None


class ModelConfigInvalid(Exception):
    """deploy/ai/models.yml cannot be used; ``problems`` lists every reason."""

    code = "MODEL_CONFIG_INVALID"

    def __init__(self, problems: Iterable[str]) -> None:
        self.problems = tuple(problems)
        super().__init__("; ".join(self.problems))


class ModelNotAvailable(Exception):
    """The requested model is not in the catalog of models that can serve now."""

    code = "MODEL_NOT_AVAILABLE"

    def __init__(self, model_id: str | None) -> None:
        self.model_id = model_id
        super().__init__(f"model {model_id!r} is not available")


def api_key_env_name(provider: str) -> str:
    """``lab-vllm`` reads its key from ``LAB_VLLM_API_KEY``."""
    return provider.upper().replace("-", "_") + "_API_KEY"
```

- [ ] **Step 2: 寫失敗的 adapter 測試**

`ai-service/tests/test_provider_adapters.py`：

```python
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
        _spec(model="gpt-5.4-mini", reasoning_effort="medium"),
        "key",
    )
    assert model.kwargs["base_url"] == "https://proxy.test/v1"
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
        _spec(provider="deepseek", model="deepseek-v4-flash", reasoning_effort="high"),
        "key",
    )
    assert isinstance(model, _ReasoningClient)
    assert model.kwargs["extra_body"] == {"thinking": {"type": "enabled"}}
    assert model.kwargs["reasoning_effort"] == "high"


def test_deepseek_without_reasoning_disables_thinking():
    model = provider_adapters.build_chat_model(
        _endpoint("deepseek", "deepseek", "https://ds.test"),
        _spec(provider="deepseek", model="deepseek-v4-flash"),
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
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `AI_PYTEST tests/test_provider_adapters.py`
Expected: FAIL，`ModuleNotFoundError: No module named 'infrastructure.agent.provider_adapters'`

- [ ] **Step 4: 實作 adapter**

`ai-service/infrastructure/agent/provider_adapters.py`：把 `infrastructure/agent/model_factory.py` 裡的 `ReasoningPreservingChatDeepSeek` 類別（含 docstring 與 `_get_request_payload`）原樣搬到這個檔案，**這一步先不要刪除 `model_factory.py` 裡的舊類別**（Task 4 才重寫該檔）。其餘內容：

```python
"""Built-in LLM provider adapters.

Code owns how to talk to each provider; deploy/ai/models.yml only picks which
models and endpoints a deployment offers.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage
from langchain_deepseek import ChatDeepSeek
from langchain_openai import ChatOpenAI

from domain.model_catalog import EndpointSpec, ModelSpec

logger = logging.getLogger(__name__)

BUILTIN_PROVIDERS = frozenset({"openai", "deepseek"})
OPENAI_COMPATIBLE = "openai_compatible"
# The SDKs honour Retry-After with exponential backoff, so most 429s from
# per-account rate limits heal without surfacing to the user.
MAX_RETRIES = 6


# class ReasoningPreservingChatDeepSeek(ChatDeepSeek): ...  <- 原樣搬移


def builtin_max_input_tokens(kind: str, model: str) -> int | None:
    """Context limit LangChain ships for a built-in provider model, if any."""
    if kind == "openai":
        profile = ChatOpenAI(model=model, api_key="profile-lookup").profile
    elif kind == "deepseek":
        profile = ChatDeepSeek(model=model, api_key="profile-lookup").profile
    else:
        return None
    value = (profile or {}).get("max_input_tokens")
    return value if isinstance(value, int) and value > 0 else None


def build_chat_model(endpoint: EndpointSpec, spec: ModelSpec, api_key: str) -> Any:
    if endpoint.kind == "deepseek":
        return _deepseek(endpoint, spec, api_key)
    return _openai(endpoint, spec, api_key)


def _openai(endpoint: EndpointSpec, spec: ModelSpec, api_key: str) -> Any:
    kwargs: dict[str, Any] = {
        "model": spec.model,
        # vLLM without --api-key accepts any bearer token but the SDK requires one.
        "api_key": api_key or "EMPTY",
        "streaming": True,
        "max_retries": MAX_RETRIES,
    }
    if endpoint.base_url:
        kwargs["base_url"] = endpoint.base_url
    if spec.reasoning_effort:
        # gpt-5.x + function tools + reasoning_effort is rejected by
        # /v1/chat/completions, so route via the Responses API. `summary=auto`
        # is required to receive reasoning blocks in the stream, and
        # `output_version=responses/v1` puts them into message.content.
        kwargs["reasoning"] = {"effort": spec.reasoning_effort, "summary": "auto"}
        kwargs["use_responses_api"] = True
        kwargs["output_version"] = "responses/v1"
    return ChatOpenAI(**kwargs)


def _deepseek(endpoint: EndpointSpec, spec: ModelSpec, api_key: str) -> Any:
    thinking = spec.reasoning_effort is not None
    kwargs: dict[str, Any] = {
        "model": spec.model,
        "api_key": api_key,
        "streaming": True,
        "max_retries": MAX_RETRIES,
        "extra_body": {"thinking": {"type": "enabled" if thinking else "disabled"}},
    }
    if endpoint.base_url:
        kwargs["api_base"] = endpoint.base_url
    if thinking:
        kwargs["reasoning_effort"] = spec.reasoning_effort
    # Thinking requests must echo prior reasoning_content.
    client = ReasoningPreservingChatDeepSeek if thinking else ChatDeepSeek
    return client(**kwargs)
```

- [ ] **Step 5: 執行測試確認通過**

Run: `AI_PYTEST tests/test_provider_adapters.py`
Expected: PASS（8 passed）

- [ ] **Step 6: Commit**

```bash
git add ai-service/domain/model_catalog.py ai-service/infrastructure/agent/provider_adapters.py ai-service/tests/test_provider_adapters.py
git commit -m "feat(ai): add built-in provider adapters and model catalog types"
```

---

### Task 2: 解析與驗證 `models.yml`

**Files:**
- Create: `ai-service/infrastructure/agent/model_config.py`
- Modify: `ai-service/config.py`（新增 `ai_models_file`）
- Test: `ai-service/tests/test_model_config.py`

**Interfaces:**
- Consumes: Task 1 的 `EndpointSpec`、`ModelSpec`、`ModelConfig`、`ModelConfigInvalid`、`api_key_env_name`、`BUILTIN_PROVIDERS`、`OPENAI_COMPATIBLE`、`builtin_max_input_tokens`
- Produces:
  - `model_config.ProfileLookup = Callable[[str, str], int | None]`
  - `model_config.parse_model_config(data: Any, env: Mapping[str, str], profile_lookup: ProfileLookup = builtin_max_input_tokens) -> ModelConfig`（有任何問題就 raise `ModelConfigInvalid`，一次列出全部）
  - `model_config.load_model_config(path: Path, env: Mapping[str, str], profile_lookup: ProfileLookup = builtin_max_input_tokens) -> ModelConfig`
  - `model_config.main() -> int`（`python -m infrastructure.agent.model_config`）
  - `Settings.ai_models_file: str`，預設 `/etc/qjudge-ai/models.yml`，env `AI_MODELS_FILE`
  - 回傳的 `ModelConfig.endpoints` 只包含被模型使用的 provider（含內建 provider，`base_url=None` 表示官方 URL）

- [ ] **Step 1: 寫失敗測試**

`ai-service/tests/test_model_config.py`：

```python
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
```

注意 `test_every_problem_is_reported_together` 的順序：頂層未知欄位 → endpoints（依 YAML 順序）→ models（依順序）→ 缺少的 key → `default`。`models[2]` 的 provider `lab` 因 `base_url` 無效而沒有進入 endpoints，所以報 provider 錯誤。

- [ ] **Step 2: 執行測試確認失敗**

Run: `AI_PYTEST tests/test_model_config.py`
Expected: FAIL，`ModuleNotFoundError: No module named 'infrastructure.agent.model_config'`

- [ ] **Step 3: 新增設定欄位**

在 `ai-service/config.py` 的 `Settings` 中、`# DeepAgent / LangGraph Settings` 之前加入（舊的 provider 欄位 Task 4 才移除）：

```python
    # Deployment model catalog; deploy/ai is mounted read-only here.
    ai_models_file: str = Field(
        default="/etc/qjudge-ai/models.yml",
        validation_alias=AliasChoices("AI_MODELS_FILE"),
    )
```

- [ ] **Step 4: 實作 `model_config.py`**

```python
"""Load and validate deploy/ai/models.yml.

``python -m infrastructure.agent.model_config`` prints every problem; ``qjudge
upgrade`` runs it with the new image before stopping the running version.
"""

from __future__ import annotations

import os
import re
import sys
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import yaml

from domain.model_catalog import (
    EndpointSpec,
    ModelConfig,
    ModelConfigInvalid,
    ModelSpec,
    api_key_env_name,
)
from infrastructure.agent.provider_adapters import (
    BUILTIN_PROVIDERS,
    OPENAI_COMPATIBLE,
    builtin_max_input_tokens,
)

ProfileLookup = Callable[[str, str], int | None]

_TOP_KEYS = frozenset({"default", "models", "endpoints"})
_MODEL_KEYS = frozenset(
    {"id", "provider", "model", "display_name", "description", "reasoning_effort", "max_input_tokens"}
)
_ENDPOINT_KEYS = frozenset({"base_url"})
_MODEL_ID = re.compile(r"[a-z0-9][a-z0-9.-]{0,49}")
_PROVIDER_NAME = re.compile(r"[a-z0-9][a-z0-9-]*")
_REASONING_EFFORTS = ("low", "medium", "high")


def load_model_config(
    path: Path,
    env: Mapping[str, str],
    profile_lookup: ProfileLookup = builtin_max_input_tokens,
) -> ModelConfig:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ModelConfigInvalid(
            [f"{path}: not found; copy deploy/ai/models.example.yml to deploy/ai/models.yml"]
        ) from exc
    except OSError as exc:
        raise ModelConfigInvalid([f"{path}: cannot be read ({exc})"]) from exc
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ModelConfigInvalid([f"{path}: invalid YAML ({exc})"]) from exc
    return parse_model_config({} if data is None else data, env, profile_lookup)


def parse_model_config(
    data: Any,
    env: Mapping[str, str],
    profile_lookup: ProfileLookup = builtin_max_input_tokens,
) -> ModelConfig:
    if not isinstance(data, dict):
        raise ModelConfigInvalid(["top level must be a mapping with models and endpoints"])
    problems: list[str] = [f"{key}: unknown field" for key in data if key not in _TOP_KEYS]
    endpoints = _parse_endpoints(data.get("endpoints"), problems)
    models, used = _parse_models(data.get("models"), endpoints, env, profile_lookup, problems)
    default_id = data.get("default")
    if default_id is not None and default_id not in {model.id for model in models}:
        problems.append(f"default: {default_id!r} is not a model id in models")
    if problems:
        raise ModelConfigInvalid(problems)
    return ModelConfig(models=tuple(models), endpoints=used, default_id=default_id)


def _parse_endpoints(raw: Any, problems: list[str]) -> dict[str, EndpointSpec]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        problems.append("endpoints: must be a mapping of name to settings")
        return {}
    endpoints: dict[str, EndpointSpec] = {}
    for name, settings in raw.items():
        where = f"endpoints.{name}"
        if not isinstance(name, str) or not _PROVIDER_NAME.fullmatch(name):
            problems.append(f"{where}: name may contain only lowercase letters, digits and -")
            continue
        if settings is None:
            settings = {}
        if not isinstance(settings, dict):
            problems.append(f"{where}: must be a mapping")
            continue
        problems.extend(f"{where}.{key}: unknown field" for key in settings if key not in _ENDPOINT_KEYS)
        base_url = settings.get("base_url")
        if base_url is None and name not in BUILTIN_PROVIDERS:
            problems.append(f"{where}.base_url: required for a self-hosted endpoint")
            continue
        if base_url is not None and not _is_http_url(base_url):
            problems.append(f"{where}.base_url: must be an http(s) URL")
            continue
        endpoints[name] = EndpointSpec(
            name=name,
            kind=name if name in BUILTIN_PROVIDERS else OPENAI_COMPATIBLE,
            base_url=base_url.rstrip("/") if base_url else None,
            api_key_env=api_key_env_name(name),
        )
    return endpoints


def _parse_models(
    raw: Any,
    endpoints: dict[str, EndpointSpec],
    env: Mapping[str, str],
    profile_lookup: ProfileLookup,
    problems: list[str],
) -> tuple[list[ModelSpec], dict[str, EndpointSpec]]:
    if raw is None:
        return [], {}
    if not isinstance(raw, list):
        problems.append("models: must be a list")
        return [], {}
    models: list[ModelSpec] = []
    used: dict[str, EndpointSpec] = {}
    missing_keys: set[str] = set()
    seen: set[str] = set()
    for index, item in enumerate(raw):
        where = f"models[{index}]"
        if not isinstance(item, dict):
            problems.append(f"{where}: must be a mapping")
            continue
        model_id = item.get("id")
        if not isinstance(model_id, str) or not _MODEL_ID.fullmatch(model_id):
            problems.append(f"{where}.id: required; lowercase letters, digits, . and -, at most 50 characters")
            continue
        where = f"models[{index}] ({model_id})"
        endpoint = _endpoint_for(item.get("provider"), endpoints)
        if endpoint is None:
            problems.append(f"{where}.provider: must be openai, deepseek or a name under endpoints")
            continue
        if model_id in seen:
            problems.append(f"{where}.id: duplicate")
            continue
        seen.add(model_id)
        problems.extend(f"{where}.{key}: unknown field" for key in item if key not in _MODEL_KEYS)
        model = _optional_str(item, "model", where, problems) or model_id
        effort = item.get("reasoning_effort")
        if effort is not None and endpoint.kind == OPENAI_COMPATIBLE:
            problems.append(f"{where}.reasoning_effort: not supported by self-hosted endpoints")
        elif effort is not None and effort not in _REASONING_EFFORTS:
            problems.append(f"{where}.reasoning_effort: must be one of low, medium, high")
        max_input = item.get("max_input_tokens")
        if max_input is not None and (isinstance(max_input, bool) or not isinstance(max_input, int) or max_input <= 0):
            problems.append(f"{where}.max_input_tokens: must be a positive integer")
            max_input = None
        elif max_input is None and endpoint.kind != OPENAI_COMPATIBLE:
            max_input = profile_lookup(endpoint.kind, model)
            if max_input is None:
                problems.append(
                    f"{where}.max_input_tokens: required; LangChain has no context limit for {model}"
                )
        if endpoint.kind != OPENAI_COMPATIBLE and not env.get(endpoint.api_key_env, "").strip():
            missing_keys.add(endpoint.api_key_env)
        used[endpoint.name] = endpoint
        models.append(
            ModelSpec(
                id=model_id,
                provider=endpoint.name,
                model=model,
                display_name=_optional_str(item, "display_name", where, problems) or model_id,
                description=_optional_str(item, "description", where, problems) or "",
                reasoning_effort=effort,
                max_input_tokens=max_input,
            )
        )
    problems.extend(f"{name}: not set in deploy/ai/keys.env" for name in sorted(missing_keys))
    return models, used


def _endpoint_for(provider: Any, endpoints: dict[str, EndpointSpec]) -> EndpointSpec | None:
    if not isinstance(provider, str):
        return None
    if provider in endpoints:
        return endpoints[provider]
    if provider in BUILTIN_PROVIDERS:
        return EndpointSpec(provider, provider, None, api_key_env_name(provider))
    return None


def _optional_str(item: dict, key: str, where: str, problems: list[str]) -> str | None:
    value = item.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        problems.append(f"{where}.{key}: must be a non-empty string")
        return None
    return value.strip()


def _is_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parts = urlsplit(value)
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def main() -> int:
    from config import get_settings

    path = Path(get_settings().ai_models_file)
    try:
        config = load_model_config(path, os.environ)
    except ModelConfigInvalid as exc:
        print(f"{path} is invalid:", file=sys.stderr)
        for problem in exc.problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print(f"{path}: {len(config.models)} model(s) configured")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: 執行測試確認通過**

Run: `AI_PYTEST tests/test_model_config.py`
Expected: PASS（15 passed）。若 `test_every_problem_is_reported_together` 只差在順序，依實作的走訪順序（頂層 → endpoints → models → keys → default）調整實作，不要改斷言內容。

- [ ] **Step 6: Commit**

```bash
git add ai-service/infrastructure/agent/model_config.py ai-service/config.py ai-service/tests/test_model_config.py
git commit -m "feat(ai): load and validate deploy/ai/models.yml"
```

---

### Task 3: 執行期模型目錄

**Files:**
- Create: `ai-service/infrastructure/agent/model_catalog.py`
- Test: `ai-service/tests/test_model_catalog.py`

**Interfaces:**
- Consumes: Task 1 型別；Task 2 `load_model_config`、`parse_model_config`
- Produces:
  - `model_catalog.PROBE_RETRY_SECONDS = 60.0`、`PROBE_TIMEOUT_SECONDS = 3.0`
  - `model_catalog.probe_max_model_len(endpoint: EndpointSpec, api_key: str, *, transport: httpx.BaseTransport | None = None) -> dict[str, int]`
  - `model_catalog.ModelCatalog(config: ModelConfig | None, problems: tuple[str, ...] = (), *, env: Mapping[str, str] | None = None, probe=probe_max_model_len, clock=time.monotonic)`
    - `ModelCatalog.load(path: Path, env=None, **kwargs) -> ModelCatalog`（設定錯誤時 log ERROR 並回傳 invalid 目錄，不 raise）
    - `.problems: tuple[str, ...]`
    - `.available() -> list[ModelSpec]`（設定錯誤時 raise `ModelConfigInvalid`；回傳的 spec 都有 `max_input_tokens`）
    - `.default_id() -> str | None`（設定錯誤或無可用模型時回傳 `None`，不 raise）
    - `.resolve(model_id: str | None) -> ModelSpec`（raise `ModelConfigInvalid` 或 `ModelNotAvailable`）
    - `.endpoint(spec: ModelSpec) -> EndpointSpec`
    - `.api_key(endpoint: EndpointSpec) -> str`
  - `model_catalog.process_model_catalog() -> ModelCatalog`（`lru_cache`，讀 `get_settings().ai_models_file`）

- [ ] **Step 1: 寫失敗測試**

`ai-service/tests/test_model_catalog.py`：

```python
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `AI_PYTEST tests/test_model_catalog.py`
Expected: FAIL，`ModuleNotFoundError: No module named 'infrastructure.agent.model_catalog'`

- [ ] **Step 3: 實作 `model_catalog.py`**

```python
"""Process-wide model catalog: which configured models can serve runs now."""

from __future__ import annotations

import logging
import os
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import replace
from functools import lru_cache
from pathlib import Path

import httpx

from domain.model_catalog import (
    EndpointSpec,
    ModelConfig,
    ModelConfigInvalid,
    ModelNotAvailable,
    ModelSpec,
)
from infrastructure.agent.model_config import load_model_config

logger = logging.getLogger(__name__)

PROBE_RETRY_SECONDS = 60.0
PROBE_TIMEOUT_SECONDS = 3.0

Probe = Callable[[EndpointSpec, str], dict[str, int]]


def probe_max_model_len(
    endpoint: EndpointSpec,
    api_key: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, int]:
    """Read each model's ``max_model_len`` from an OpenAI-compatible server (vLLM)."""
    with httpx.Client(transport=transport, timeout=PROBE_TIMEOUT_SECONDS) as client:
        response = client.get(
            f"{endpoint.base_url}/models",
            headers={"Authorization": f"Bearer {api_key or 'EMPTY'}"},
        )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise ValueError("unexpected /models response")
    limits: dict[str, int] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        model, limit = item.get("id"), item.get("max_model_len")
        if isinstance(model, str) and isinstance(limit, int) and limit > 0:
            limits[model] = limit
    return limits


class ModelCatalog:
    def __init__(
        self,
        config: ModelConfig | None,
        problems: tuple[str, ...] = (),
        *,
        env: Mapping[str, str] | None = None,
        probe: Probe = probe_max_model_len,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._config = config
        self.problems = problems
        self._env = os.environ if env is None else env
        self._probe = probe
        self._clock = clock
        self._lock = threading.Lock()
        # endpoint name -> (limits or None after a failed probe, fetched at)
        self._limits: dict[str, tuple[dict[str, int] | None, float]] = {}

    @classmethod
    def load(cls, path: Path, env: Mapping[str, str] | None = None, **kwargs) -> ModelCatalog:
        env = os.environ if env is None else env
        try:
            return cls(load_model_config(path, env), env=env, **kwargs)
        except ModelConfigInvalid as exc:
            logger.error(
                "AI model configuration %s is invalid; AI features are disabled:\n%s",
                path,
                "\n".join(f"  - {problem}" for problem in exc.problems),
            )
            return cls(None, exc.problems, env=env, **kwargs)

    def available(self) -> list[ModelSpec]:
        config = self._require_config()
        available: list[ModelSpec] = []
        for spec in config.models:
            if spec.max_input_tokens is not None:
                available.append(spec)
                continue
            limit = self._probed_limit(config.endpoints[spec.provider], spec.model)
            if limit is not None:
                available.append(replace(spec, max_input_tokens=limit))
        return available

    def default_id(self) -> str | None:
        if self._config is None:
            return None
        ids = [spec.id for spec in self.available()]
        if self._config.default_id in ids:
            return self._config.default_id
        return ids[0] if ids else None

    def resolve(self, model_id: str | None) -> ModelSpec:
        wanted = model_id or self.default_id()
        for spec in self.available():
            if spec.id == wanted:
                return spec
        raise ModelNotAvailable(model_id)

    def endpoint(self, spec: ModelSpec) -> EndpointSpec:
        return self._require_config().endpoints[spec.provider]

    def api_key(self, endpoint: EndpointSpec) -> str:
        return self._env.get(endpoint.api_key_env, "").strip()

    def _require_config(self) -> ModelConfig:
        if self._config is None:
            raise ModelConfigInvalid(self.problems)
        return self._config

    def _probed_limit(self, endpoint: EndpointSpec, model: str) -> int | None:
        with self._lock:
            cached = self._limits.get(endpoint.name)
            expired = cached is not None and self._clock() - cached[1] >= PROBE_RETRY_SECONDS
            if cached is None or (model not in (cached[0] or {}) and expired):
                cached = (self._fetch(endpoint), self._clock())
                self._limits[endpoint.name] = cached
                if cached[0] is not None and model not in cached[0]:
                    logger.warning(
                        "%s/models does not report max_model_len for %s; "
                        "set max_input_tokens in deploy/ai/models.yml",
                        endpoint.base_url,
                        model,
                    )
        limits = cached[0]
        return None if limits is None else limits.get(model)

    def _fetch(self, endpoint: EndpointSpec) -> dict[str, int] | None:
        try:
            return self._probe(endpoint, self.api_key(endpoint))
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning(
                "Cannot read max_model_len from %s (%s); its models are unavailable",
                endpoint.base_url,
                exc,
            )
            return None


@lru_cache
def process_model_catalog() -> ModelCatalog:
    from config import get_settings

    return ModelCatalog.load(Path(get_settings().ai_models_file))
```

- [ ] **Step 4: 執行測試確認通過**

Run: `AI_PYTEST tests/test_model_catalog.py`
Expected: PASS（11 passed）

- [ ] **Step 5: Commit**

```bash
git add ai-service/infrastructure/agent/model_catalog.py ai-service/tests/test_model_catalog.py
git commit -m "feat(ai): add runtime model catalog with self-hosted probing"
```

---

### Task 4: `ModelFactory` 改用目錄，移除舊 registry

**Files:**
- Rewrite: `ai-service/infrastructure/agent/model_factory.py`
- Modify: `ai-service/infrastructure/agent/deepagent_adapter.py`（import、`repair_thread`、`_infer_model_max_input_tokens`）
- Modify: `ai-service/infrastructure/agent/recursion_failure_handler.py`
- Modify: `ai-service/config.py`（移除 `deepseek_*`、`openai_*`、`vllm_*` 六個欄位）
- Delete: `ai-service/domain/model_registry.py`、`ai-service/infrastructure/agent/tpm_gate.py`、`ai-service/tests/test_tpm_gate.py`、`ai-service/tests/unit/test_provider_endpoint_config.py`
- Rewrite: `ai-service/tests/test_model_factory.py`
- Modify: `ai-service/tests/test_recursion_failure_handler.py`、`ai-service/tests/test_deepagent_adapter_config.py`

**Interfaces:**
- Consumes: Task 1 `build_chat_model`；Task 3 `ModelCatalog`、`process_model_catalog`
- Produces:
  - `ModelFactory.create_model(model_id: str | None = None, catalog: ModelCatalog | None = None) -> Any`（raise `ModelConfigInvalid`／`ModelNotAvailable`）
  - `model_factory.SUMMARIZATION_TRIGGER_FRACTION = 0.70`、`model_factory.SUMMARY_TRIM_TOKENS = 12_000`
  - 建出的 model 帶 `profile["max_input_tokens"]`、`_qjudge_model_id`、`_qjudge_model_name`、`_qjudge_max_input_tokens`、`_qjudge_summarization_trim_tokens`、`_qjudge_summarization_trigger_fraction`
  - `RecursionFailureHandler(summary_model_id: str | None = None, ...)`：`None` 時用目錄預設，無可用模型時回傳 fallback 摘要

- [ ] **Step 1: 重寫失敗的 factory 測試**

`ai-service/tests/test_model_factory.py` 全檔改為：

```python
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `AI_PYTEST tests/test_model_factory.py`
Expected: FAIL（舊 `create_model` 不接受 `catalog` 參數：`TypeError`）

- [ ] **Step 3: 重寫 `model_factory.py`**

全檔改為：

```python
"""Create LangChain chat models for the model IDs a deployment configures."""

from __future__ import annotations

import logging
from typing import Any

from domain.model_catalog import ModelSpec
from infrastructure.agent.model_catalog import ModelCatalog, process_model_catalog
from infrastructure.agent.provider_adapters import build_chat_model

logger = logging.getLogger(__name__)

SUMMARIZATION_TRIGGER_FRACTION = 0.70
SUMMARY_TRIM_TOKENS = 12_000


class ModelFactory:
    """Factory for creating LLM model instances."""

    @staticmethod
    def create_model(model_id: str | None = None, catalog: ModelCatalog | None = None) -> Any:
        """Build ``model_id`` (the catalog default when ``None``).

        Raises ``ModelConfigInvalid`` or ``ModelNotAvailable`` when the
        deployment cannot serve it.
        """
        catalog = catalog or process_model_catalog()
        spec = catalog.resolve(model_id)
        endpoint = catalog.endpoint(spec)
        logger.info(
            "Creating %s model=%s for %s (reasoning_effort=%s)",
            endpoint.kind,
            spec.model,
            spec.id,
            spec.reasoning_effort,
        )
        model = build_chat_model(endpoint, spec, catalog.api_key(endpoint))
        _stamp_limits(model, spec)
        return model


def _stamp_limits(model: Any, spec: ModelSpec) -> None:
    # DeepAgents picks fraction-based compaction only when
    # profile.max_input_tokens is a real int; DeepSeek and self-hosted
    # clients ship without one.
    model.profile = {**(getattr(model, "profile", None) or {}), "max_input_tokens": spec.max_input_tokens}
    setattr(model, "_qjudge_model_id", spec.id)
    setattr(model, "_qjudge_model_name", spec.model)
    setattr(model, "_qjudge_max_input_tokens", spec.max_input_tokens)
    setattr(model, "_qjudge_summarization_trim_tokens", SUMMARY_TRIM_TOKENS)
    setattr(model, "_qjudge_summarization_trigger_fraction", SUMMARIZATION_TRIGGER_FRACTION)
```

- [ ] **Step 4: 找出並修正舊名稱的引用**

Run: `grep -rn "model_registry\|MODEL_INFO\|MODEL_IDS\|_DEFAULT_MODEL_ID\|MODEL_MAX_INPUT_TOKENS\|MODEL_SUMMARY_TRIM_TOKENS\|tpm_gate\|TpmGated\|get_model_max_input_tokens\|get_summary_trim_tokens\|resolve_model_string\|openai_api_key\|deepseek_api_key\|vllm_\|openai_base_url\|deepseek_base_url" ai-service --include='*.py'`

依結果修改（`api/schemas.py`、`api/routers/system.py` 留給 Task 5）：

1. `infrastructure/agent/deepagent_adapter.py`：從 `model_factory` 的 import 中移除 `_DEFAULT_MODEL_ID as _REPAIR_MODEL_ID`，新增 `from infrastructure.agent.model_catalog import process_model_catalog`。`repair_thread` 改為：

```python
    async def repair_thread(self, thread_id: str) -> bool:
        """Proactively repair dangling tool_calls after a run is cancelled.

        Builds a minimal agent (no MCP tools) solely for checkpoint state
        read/write — the model is never invoked. Returns True if any repair
        messages were injected.
        """
        if self._checkpointer is None:
            raise RuntimeError("Checkpointer not initialized")
        model_id = process_model_catalog().default_id()
        if model_id is None:
            logger.warning("Skipping checkpoint repair for %s: no AI model is available", thread_id)
            return False
        agent = self._build_agent(model_id=model_id, system_prompt=None, tools=[])
        config = {"configurable": {"thread_id": thread_id}}
        return await self._repair_dangling_tool_calls(agent, config)
```

   同檔 `_infer_model_max_input_tokens` 刪除最後的 `# Final fallback for OpenAI GPT-5 family.` 區塊（`model_name = cls._extract_model_name(model)` 與 `if model_name.startswith("gpt-5"): return 400_000`），直接 `return None`。若 `_extract_model_name` 因此不再被使用，一併刪除。

2. `infrastructure/agent/recursion_failure_handler.py`：刪除 `_DEFAULT_RECURSION_SUMMARY_MODEL_ID`，新增 `from infrastructure.agent.model_catalog import process_model_catalog`，`__init__` 的參數改為 `summary_model_id: str | None = None`，`summarize_interruption` 中建立模型那段改為：

```python
        model_id = self._summary_model_id or process_model_catalog().default_id()
        if model_id is None:
            return self.fallback_recursion_summary()
        summary_model = self._model_factory(model_id)
```

3. `config.py`：刪除 `deepseek_api_key`、`openai_api_key`、`deepseek_base_url`、`openai_base_url`、`vllm_api_key`、`vllm_base_url` 六個欄位與上方註解。

4. 刪除檔案：

```bash
git rm ai-service/domain/model_registry.py ai-service/infrastructure/agent/tpm_gate.py ai-service/tests/test_tpm_gate.py ai-service/tests/unit/test_provider_endpoint_config.py
```

5. `tests/test_recursion_failure_handler.py`：所有 `RecursionFailureHandler(model_factory=...)` 呼叫加上 `summary_model_id="summary-model"`，讓測試不依賴 process 目錄。

6. `tests/test_deepagent_adapter_config.py`：若有測試斷言 `gpt-5` 名稱推測出 400000（`_infer_model_max_input_tokens` 對沒有 `_qjudge_max_input_tokens` 與 profile 的 model 回傳 400000），把預期改為 `None` 或刪除該案例；保留使用 `_qjudge_max_input_tokens` 的案例。

- [ ] **Step 5: 執行 ai-service 全部測試**

Run: `AI_PYTEST tests/test_model_factory.py tests/test_recursion_failure_handler.py tests/test_deepagent_adapter_config.py tests/test_provider_adapters.py tests/test_model_config.py tests/test_model_catalog.py`
Expected: PASS

Run: `AI_PYTEST tests`
Expected: 除 `tests/test_api.py` 的 `/v1/models` 與 `schemas.py` import 相關失敗（Task 5 處理）外全部通過。若有其他失敗，回頭檢查 Step 4 的 grep 結果。

- [ ] **Step 6: Commit**

```bash
git add -A ai-service
git commit -m "refactor(ai): build models from the deployment catalog"
```

---

### Task 5: API 模型目錄與錯誤碼

**Files:**
- Modify: `ai-service/api/dependencies.py`、`ai-service/api/schemas.py:100-111`、`ai-service/api/routers/system.py:54-60`、`ai-service/api/routers/runs.py:112-135`、`ai-service/api/errors.py`、`ai-service/main.py`（`create_app`）
- Test: `ai-service/tests/test_api.py`

**Interfaces:**
- Consumes: Task 3 `ModelCatalog`、`process_model_catalog`；Task 1 `ModelConfigInvalid`、`ModelNotAvailable`
- Produces:
  - `api.dependencies.get_model_catalog(request) -> ModelCatalog`（讀 `app.state.model_catalog`）
  - `StartRunRequest.model_id: str | None`（預設 `None`）
  - `GET /v1/models`：`{"models": [{model_id, display_name, description, is_default}]}`，只含可用模型
  - 錯誤：`ModelConfigInvalid` → 503 `MODEL_CONFIG_INVALID`（retryable false）；`ModelNotAvailable` → 422 `MODEL_NOT_AVAILABLE`（retryable false）

- [ ] **Step 1: 寫失敗測試**

在 `ai-service/tests/test_api.py`：

1. import 區加入：

```python
from api.dependencies import get_model_catalog
from infrastructure.agent.model_catalog import ModelCatalog
from infrastructure.agent.model_config import parse_model_config
```

2. `make_client` 之前加入測試目錄，並讓 `make_client` 接受目錄：

```python
def make_catalog() -> ModelCatalog:
    env = {"OPENAI_API_KEY": "k", "DEEPSEEK_API_KEY": "k"}
    config = parse_model_config(
        {
            "default": "deepseek-v4-flash",
            "models": [
                {"id": "openai-nano", "provider": "openai", "model": "gpt-5-nano",
                 "display_name": "gpt-5-nano", "max_input_tokens": 400_000},
                {"id": "deepseek-v4-flash", "provider": "deepseek", "max_input_tokens": 1_000_000},
            ],
        },
        env,
        lambda kind, model: None,
    )
    return ModelCatalog(config, env=env)


def make_client(catalog: ModelCatalog | None = None) -> tuple[TestClient, FakeRunService]:
    # ...保留原本內容，在 return 之前加入：
    selected = catalog or make_catalog()
    app.dependency_overrides[get_model_catalog] = lambda: selected
```

3. 把 `test_...`（約第 428–437 行）中 `/v1/models` 的斷言改為：

```python
    models = client.get("/v1/models")
    assert models.status_code == 200
    assert models.json()["models"] == [
        {"model_id": "openai-nano", "display_name": "gpt-5-nano", "description": "", "is_default": False},
        {"model_id": "deepseek-v4-flash", "display_name": "deepseek-v4-flash", "description": "",
         "is_default": True},
    ]
```

（保留後面 `forbidden` 的檢查。）

4. 新增測試：

```python
def test_start_run_accepts_null_model_id_and_uses_default() -> None:
    client, _ = make_client()
    created = client.post(
        f"/v1/sessions/{SESSION_ID}/runs",
        headers={"Idempotency-Key": "null-model"},
        json={"message": "hello", "model_id": None},
    )
    assert created.status_code == 202
    assert created.json()["model_id"] == "deepseek-v4-flash"


def test_start_run_rejects_unavailable_model() -> None:
    client, _ = make_client()
    response = client.post(
        f"/v1/sessions/{SESSION_ID}/runs",
        headers={"Idempotency-Key": "gone-model"},
        json={"message": "hello", "model_id": "removed-model"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "MODEL_NOT_AVAILABLE"
    assert response.json()["error"]["retryable"] is False


def test_invalid_model_config_is_reported_without_breaking_readiness() -> None:
    client, _ = make_client(ModelCatalog(None, ("OPENAI_API_KEY: not set in deploy/ai/keys.env",)))
    models = client.get("/v1/models")
    assert models.status_code == 503
    assert models.json()["error"]["code"] == "MODEL_CONFIG_INVALID"
    assert "OPENAI_API_KEY" not in models.json()["error"]["message"]
    started = client.post(
        f"/v1/sessions/{SESSION_ID}/runs",
        headers={"Idempotency-Key": "invalid-config"},
        json={"message": "hello"},
    )
    assert started.status_code == 503
    assert started.json()["error"]["code"] == "MODEL_CONFIG_INVALID"
    assert client.get("/health/ready").status_code == 200


def test_empty_catalog_lists_no_models() -> None:
    client, _ = make_client(ModelCatalog(parse_model_config({}, {}, lambda kind, model: None), env={}))
    assert client.get("/v1/models").json() == {"models": []}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `AI_PYTEST tests/test_api.py`
Expected: FAIL（`ImportError: cannot import name 'get_model_catalog'`）

- [ ] **Step 3: 實作**

1. `api/dependencies.py` 在 `get_readiness_probe` 旁加入：

```python
def get_model_catalog(request: Request) -> Any:
    return _state(request, "model_catalog")
```

2. `main.py`：import `from infrastructure.agent.model_catalog import process_model_catalog`，在 `create_app()` 中 `app.state.sse_poll_seconds = 0.5` 之後加入：

```python
    # Invalid config is logged and reported per request; it never blocks startup.
    app.state.model_catalog = process_model_catalog()
```

3. `api/schemas.py`：`StartRunRequest` 改為（刪除 `supported_model_id` validator 與 `MODEL_IDS` import）：

```python
class StartRunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100_000)
    # None selects the deployment's default model.
    model_id: str | None = Field(default=None, min_length=1, max_length=50)
```

4. `api/routers/system.py`：import `asyncio`、`get_model_catalog`、`ModelInfo`，`models` route 改為：

```python
@system_router.get("/models", response_model=ModelsResponse)
async def models(
    _principal: Annotated[Principal, Depends(current_principal)],
    catalog: Annotated[Any, Depends(get_model_catalog)],
) -> ModelsResponse:
    # Probing a self-hosted endpoint is blocking I/O.
    available, default_id = await asyncio.to_thread(
        lambda: (catalog.available(), catalog.default_id())
    )
    return ModelsResponse(
        models=[
            ModelInfo(
                model_id=spec.id,
                display_name=spec.display_name,
                description=spec.description,
                is_default=spec.id == default_id,
            )
            for spec in available
        ]
    )
```

5. `api/routers/runs.py`：import `asyncio` 與 `get_model_catalog`，`start_run` 加參數 `catalog: Annotated[Any, Depends(get_model_catalog)],`，呼叫 service 前解析：

```python
    model = await asyncio.to_thread(catalog.resolve, body.model_id)
    run = await service.start(
        principal,
        session_id,
        body.message,
        model.id,
        idempotency_key,
        token,
    )
```

6. `api/errors.py`：import `from domain.model_catalog import ModelConfigInvalid, ModelNotAvailable`，在 `install_error_handlers` 內、`validation_error` handler 之前加入：

```python
    @app.exception_handler(ModelConfigInvalid)
    async def model_config_invalid(request: Request, _exc: ModelConfigInvalid) -> JSONResponse:
        # Details stay in the ai-service log; users only need to know whom to ask.
        return error_response(
            request,
            status_code=503,
            code="MODEL_CONFIG_INVALID",
            message="AI model configuration is invalid; ask the site administrator to check it.",
        )

    @app.exception_handler(ModelNotAvailable)
    async def model_not_available(request: Request, _exc: ModelNotAvailable) -> JSONResponse:
        return error_response(
            request,
            status_code=422,
            code="MODEL_NOT_AVAILABLE",
            message="The selected AI model is not available.",
        )
```

- [ ] **Step 4: 執行測試確認通過**

Run: `AI_PYTEST tests`
Expected: PASS（全部）

- [ ] **Step 5: 更新 OpenAPI 產物**

Run: `grep -rn "model_id" backend/schema.yml | head` 確認 schema 是否由 Django 產生；若 `ai-service` 有 committed OpenAPI 檔（`find ai-service -name "openapi*.json" -o -name "openapi*.yml"`），依該檔既有的產生方式重新產生；沒有就略過。

- [ ] **Step 6: Commit**

```bash
git add -A ai-service
git commit -m "feat(ai): serve the deployment model catalog and report config errors"
```

---

### Task 6: Django BFF 不再指定預設模型

**Files:**
- Modify: `backend/apps/ai/serializers.py:33-43`、`backend/apps/ai/views.py:259-262`
- Test: `backend/apps/ai/tests/test_start_run_serializer.py`

**Interfaces:**
- Consumes: Task 5 的 `StartRunRequest.model_id: str | None`
- Produces: `POST /api/.../sessions/{id}/runs/` 未帶 `model_id` 時轉送 `"model_id": null`

- [ ] **Step 1: 改寫失敗測試**

把 `test_start_run_serializer_default_model_id_is_openai_nano` 換成：

```python
def test_start_run_serializer_leaves_model_choice_to_ai_service():
    serializer = StartRunSerializer(data={"content": "hello"})
    assert serializer.is_valid(), serializer.errors
    assert "model_id" not in serializer.validated_data
```

並把 `test_start_run_serializer_accepts_expected_model_ids` 的清單縮成兩個代表值（`"openai-nano"`、`"gemma4-31b"`），因為 BFF 不再認得特定 ID。

- [ ] **Step 2: 執行測試確認失敗**

Run: `BE_PYTEST apps/ai/tests/test_start_run_serializer.py`
Expected: FAIL（`model_id` 仍被填入 `openai-nano`）

- [ ] **Step 3: 實作**

`serializers.py`：

```python
    # The independent AI service owns the live model registry, the default
    # model and authoritative validation.
    model_id = serializers.CharField(max_length=50, required=False)
```

`views.py` 的 `json_body`：

```python
                "model_id": serializer.validated_data.get("model_id"),
```

- [ ] **Step 4: 執行測試確認通過**

Run: `BE_PYTEST apps/ai/tests/test_start_run_serializer.py apps/ai/tests/test_bff_contract.py`
Expected: PASS。若 `test_bff_contract.py` 斷言轉送的 body 含 `openai-nano`，改成斷言未帶 `model_id` 時為 `None`。

- [ ] **Step 5: 重新產生 `backend/schema.yml`**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py spectacular --file schema.yml`
Expected: `StartRunSerializer.model_id` 不再有 `default: openai-nano`。注意 `backend/schema.yml` 在工作區已有使用者未提交的修改：先 `git diff backend/schema.yml` 看清楚，只 stage 本任務造成的 hunk（`git add -p backend/schema.yml`）。

- [ ] **Step 6: Commit**

```bash
git add backend/apps/ai/serializers.py backend/apps/ai/views.py backend/apps/ai/tests/test_start_run_serializer.py
git add -p backend/schema.yml
git commit -m "refactor(ai-bff): let the AI service pick the default model"
```

---

### Task 7: 部署檔、CLI 與 CI

**Files:**
- Create: `deploy/ai/models.example.yml`、`ci/ai/models.yml`
- Modify: `.gitignore`、`deploy/compose.yml`、`deploy/qjudge_cli/schema.py:142-147`、`deploy/qjudge_cli/check.py`、`deploy/qjudge_cli/init.py`、`deploy/qjudge_cli/release.py`、`deploy/.env.example`（重新產生）、`ci/compose.e2e.yml`
- Test: `deploy/qjudge_cli/tests/test_check.py`、`test_init.py`、`test_release.py`

**Interfaces:**
- Consumes: Task 2 的 `python -m infrastructure.agent.model_config`（exit 0／1）
- Produces:
  - `check.MOVED_AI_KEYS`：舊 key 的專用錯誤訊息 `"<KEY>: moved; put API keys in deploy/ai/keys.env and base URLs in deploy/ai/models.yml"`
  - `release.MODEL_CONFIG_CHECK = ("ai-service", ("python", "-m", "infrastructure.agent.model_config"))`，在 build 之後、postgres 啟動與備份之前執行
  - `init._ensure_models_file(deploy_dir: Path) -> None`

- [ ] **Step 1: 寫失敗的 CLI 測試**

`deploy/qjudge_cli/tests/test_check.py` 新增：

```python
    def test_moved_ai_keys_point_to_deploy_ai(self):
        errors = check_env(with_changes(OPENAI_API_KEY="sk", VLLM_BASE_URL="http://vllm"))
        self.assertIn(
            "OPENAI_API_KEY: moved; put API keys in deploy/ai/keys.env and base URLs in deploy/ai/models.yml",
            errors,
        )
        self.assertIn(
            "VLLM_BASE_URL: moved; put API keys in deploy/ai/keys.env and base URLs in deploy/ai/models.yml",
            errors,
        )
```

`deploy/qjudge_cli/tests/test_init.py` 新增（沿用該檔 `no_docker`、`BUNDLED`）：

```python
    def test_init_copies_the_models_example_once(self):
        with tempfile.TemporaryDirectory() as directory:
            deploy = Path(directory)
            (deploy / "ai").mkdir()
            (deploy / "ai" / "models.example.yml").write_text("models: []\n")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(run_init(deploy, deploy / ".env", BUNDLED, interactive=False, run=no_docker), 0)
            self.assertEqual((deploy / "ai" / "models.yml").read_text(), "models: []\n")

    def test_init_keeps_an_existing_models_file(self):
        with tempfile.TemporaryDirectory() as directory:
            deploy = Path(directory)
            (deploy / "ai").mkdir()
            (deploy / "ai" / "models.example.yml").write_text("models: []\n")
            (deploy / "ai" / "models.yml").write_text("default: mine\n")
            with redirect_stdout(io.StringIO()):
                run_init(deploy, deploy / ".env", BUNDLED, interactive=False, run=no_docker)
            self.assertEqual((deploy / "ai" / "models.yml").read_text(), "default: mine\n")
```

`deploy/qjudge_cli/tests/test_release.py` 新增：

```python
    def test_invalid_model_config_aborts_before_stopping_anything(self):
        host = FakeHost(fail_on=("infrastructure.agent.model_config",))
        self.assertEqual(self._upgrade(host), 1)
        self.assertEqual(host.head, OLD)
        commands = host.commands()
        self.assertFalse(any("pg_dump" in c for c in commands))
        self.assertFalse(any(" up -d " in f" {c} " for c in commands))

    def test_model_config_is_checked_right_after_build(self):
        host = FakeHost()
        self.assertEqual(self._upgrade(host), 0)
        order = host.commands()
        build = next(i for i, c in enumerate(order) if c.endswith(" build"))
        check = next(i for i, c in enumerate(order)
                     if "run --rm --no-deps ai-service python -m infrastructure.agent.model_config" in c)
        postgres = next(i for i, c in enumerate(order) if "up -d postgres" in c)
        self.assertLess(build, check)
        self.assertLess(check, postgres)
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: 上述新測試 FAIL（`unknown key` 訊息不符、`models.yml` 未建立、找不到 model_config 指令）

- [ ] **Step 3: 實作 CLI**

1. `schema.py`：刪除 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`VLLM_API_KEY`、`VLLM_BASE_URL` 六個 `Key(...)`。

2. `check.py`：`HTTP_URL_KEYS` 移除三個 `*_BASE_URL`；新增常數並改寫未知 key 迴圈：

```python
MOVED_AI_KEYS = {
    "OPENAI_API_KEY", "OPENAI_BASE_URL",
    "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL",
    "VLLM_API_KEY", "VLLM_BASE_URL",
}
```

```python
    for name in sorted(set(env) - set(KEYS_BY_NAME)):
        if name in MOVED_AI_KEYS:
            errors.append(
                f"{name}: moved; put API keys in deploy/ai/keys.env and base URLs in deploy/ai/models.yml"
            )
        else:
            errors.append(f"{name}: unknown key; see deploy/.env.example for supported keys")
```

3. `init.py`：在 `run_init` 中 `print(f"Wrote {env_file}")` 之後呼叫 `_ensure_models_file(deploy_dir)`，並新增：

```python
def _ensure_models_file(deploy_dir: Path) -> None:
    models = deploy_dir / "ai" / "models.yml"
    example = deploy_dir / "ai" / "models.example.yml"
    if models.exists() or not example.exists():
        return
    models.write_text(example.read_text())
    print(f"Wrote {models}; list this host's AI models there and their API keys in deploy/ai/keys.env")
```

4. `release.py`：在 `MIGRATIONS` 下方加入

```python
# Validated with the new image before anything stops; problems print to the console.
MODEL_CONFIG_CHECK = ("ai-service", ("python", "-m", "infrastructure.agent.model_config"))
```

   並在 `upgrade()` 的 `build` 檢查之後、`up -d postgres` 之前加入：

```python
    service, command = MODEL_CONFIG_CHECK
    if stack.compose(version, "run", "--rm", "--no-deps", service, *command).returncode != 0:
        return abort("deploy/ai/models.yml is invalid; services still run the previous version")
```

5. 重新產生範例：`deploy/qjudge env-example > deploy/.env.example`

- [ ] **Step 4: 執行 CLI 測試確認通過**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: PASS（含 `test_committed_example_matches_schema`）

- [ ] **Step 5: 建立部署檔與 compose 變更**

`deploy/ai/models.example.yml`：

```yaml
# AI models this host offers. Copy to deploy/ai/models.yml.
# API keys go in deploy/ai/keys.env as <PROVIDER>_API_KEY, for example
# OPENAI_API_KEY, DEEPSEEK_API_KEY or LAB_VLLM_API_KEY for endpoint lab-vllm.
# Restart ai-service and ai-worker after editing.
#
# default: gpt-5-nano            # optional; first available model otherwise
#
# models:
#   - id: gpt-5-nano              # built-in provider: openai or deepseek
#     provider: openai
#   - id: deepseek-v4-flash
#     provider: deepseek
#     reasoning_effort: high      # low | medium | high
#     max_input_tokens: 1000000   # required when LangChain has no profile
#   - id: gemma4-31b              # self-hosted OpenAI-compatible endpoint
#     provider: lab-vllm
#     model: Gemma4-31B           # defaults to id
#     display_name: Gemma4-31B    # defaults to id
#     description: Campus vLLM
#
# endpoints:
#   lab-vllm:
#     base_url: http://10.0.0.5:8000/v1

models: []
```

`.gitignore` 加入（`keys.env` 已被 `*.env` 涵蓋）：

```
/deploy/ai/models.yml
```

`deploy/compose.yml`：
- `x-ai-environment` 刪除 `OPENAI_API_KEY` 到 `VLLM_BASE_URL` 六行。
- `ai-service` 與 `ai-worker` 兩個 service 都加入：

```yaml
    env_file:
      - path: ./ai/keys.env
        required: false
    volumes:
      - ./ai:/etc/qjudge-ai:ro
```

`ci/ai/models.yml`：

```yaml
# CI E2E catalog: every model talks to the fake OpenAI-compatible adapter.
models:
  - id: openai-nano
    provider: fake
    model: gpt-5-nano
    max_input_tokens: 400000

endpoints:
  fake:
    base_url: http://fake-ai-adapters:8080/v1
```

`ci/compose.e2e.yml`：`x-fake-ai-environment` 刪除 `OPENAI_*`、`DEEPSEEK_*`、`VLLM_*` 六行，改加 `FAKE_API_KEY: fake-test-provider-key`；`x-fake-ai-service` 加入：

```yaml
  volumes:
    - ../ci/ai:/etc/qjudge-ai:ro
```

- [ ] **Step 6: 驗證 compose 與 lint**

Run: `deploy/qjudge lint-compose`
Expected: 沒有問題

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config --quiet`
Expected: exit 0

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config | grep -A3 "qjudge-ai"`
Expected: `ai-service` 與 `ai-worker` 都有 `target: /etc/qjudge-ai` 的唯讀 bind，且 dev overlay 的 `/app` 掛載仍在。

- [ ] **Step 7: dev 端到端檢查**

1. 若 `deploy/.env` 仍有六個舊 AI key，照 spec 第 7 節搬到 `deploy/ai/keys.env` 並建立 `deploy/ai/models.yml`（先放一個 `deepseek-v4-flash` 或 `openai-nano`）。
2. Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --force-recreate ai-service ai-worker`
3. Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m infrastructure.agent.model_config`
   Expected: `... N model(s) configured`，exit 0
4. 暫時把 `models.yml` 的 `provider` 改成不存在的名稱，重跑第 2、3 步：Expected: 印出問題並 exit 1；`qjudge-dc.sh dev ps` 中 `ai-service` 仍為 healthy，`backend` 正常。檢查完改回。

- [ ] **Step 8: Commit**

```bash
git add .gitignore deploy/ai/models.example.yml deploy/compose.yml deploy/.env.example deploy/qjudge_cli ci/ai/models.yml ci/compose.e2e.yml
git commit -m "feat(deploy): configure AI models per host under deploy/ai"
```

---

### Task 8: 前端模型可用性訊息與批改預設

**Files:**
- Create: `frontend/src/shared/ai/modelAvailabilityNotice.ts`
- Test: `frontend/src/shared/ai/modelAvailabilityNotice.test.ts`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ComposerBar.tsx`、`ComposerBar.test.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/QJudgeCopilotSlotComponents.tsx`（`QJudgeCopilotComposer`）
- Modify: `frontend/src/features/contest/screens/settings/ContestAiGradingScreen.tsx`、`frontend/src/features/contest/screens/settings/grading/useAiQuestionGrading.ts`
- Modify: `frontend/src/i18n/locales/{zh-TW,en,ja,ko}/chatbot.json`
- Modify: `frontend/src/infrastructure/api/repositories/chatbot.repository.test.ts`、`frontend/src/features/chatbot/components/chat-ui/__stories__/ComposerBar.stories.tsx`（僅在引用已刪除常數時）

**Interfaces:**
- Consumes: Task 5 錯誤碼；BFF 原樣轉送的 `{ success: false, error: { code } }`；`requestJson` 把 body 放在 `error.envelope`、`mapQJudgeError` 把原始錯誤放在 `cause`
- Produces:
  - `aiErrorCode(cause: unknown): string | undefined`
  - `type ModelAvailabilityNotice = { kind: "config-invalid" | "no-models" | "service-unavailable"; blocking: true } | { kind: "model-not-available"; blocking: false }`
  - `modelAvailabilityNotice(input: { status: CopilotModelStatus; models: readonly CopilotModel[]; error: CopilotError | null; runError?: CopilotError | null }): ModelAvailabilityNotice | null`
  - `MODEL_NOTICE_I18N_KEY: Record<ModelAvailabilityNotice["kind"], string>`（`chatbot` namespace 的 key）
  - `ComposerBar` 新 prop `modelNotice?: string | null`

- [ ] **Step 1: 寫失敗的純函式測試**

`frontend/src/shared/ai/modelAvailabilityNotice.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import type { CopilotError } from "@copilot";

import { aiErrorCode, modelAvailabilityNotice } from "./modelAvailabilityNotice";

function upstream(code: string, operation: CopilotError["operation"]): CopilotError {
  const original = Object.assign(new Error("upstream"), {
    envelope: { success: false, error: { code } },
  });
  return { code: "transport-error", operation, recoverable: true, cause: original };
}

const model = { id: "gemma4-31b", displayName: "Gemma4-31B" };

describe("aiErrorCode", () => {
  it("reads the envelope code through wrapped causes", () => {
    expect(aiErrorCode(upstream("MODEL_CONFIG_INVALID", "load-models"))).toBe("MODEL_CONFIG_INVALID");
    expect(aiErrorCode(new Error("plain"))).toBeUndefined();
    expect(aiErrorCode(null)).toBeUndefined();
  });
});

describe("modelAvailabilityNotice", () => {
  it("blocks with a config message when the catalog reports invalid config", () => {
    expect(
      modelAvailabilityNotice({
        status: "error",
        models: [],
        error: upstream("MODEL_CONFIG_INVALID", "load-models"),
      }),
    ).toEqual({ kind: "config-invalid", blocking: true });
  });

  it("blocks with the service message for other load failures", () => {
    expect(
      modelAvailabilityNotice({
        status: "error",
        models: [],
        error: upstream("AI_SERVICE_UNAVAILABLE", "load-models"),
      }),
    ).toEqual({ kind: "service-unavailable", blocking: true });
  });

  it("blocks when the site has no models", () => {
    expect(modelAvailabilityNotice({ status: "ready", models: [], error: null })).toEqual({
      kind: "no-models",
      blocking: true,
    });
  });

  it("asks for another model when a send hits an unavailable model", () => {
    expect(
      modelAvailabilityNotice({
        status: "ready",
        models: [model],
        error: null,
        runError: upstream("MODEL_NOT_AVAILABLE", "start-run"),
      }),
    ).toEqual({ kind: "model-not-available", blocking: false });
  });

  it("stays quiet while loading or when models are ready", () => {
    expect(modelAvailabilityNotice({ status: "loading", models: [], error: null })).toBeNull();
    expect(modelAvailabilityNotice({ status: "ready", models: [model], error: null })).toBeNull();
    expect(
      modelAvailabilityNotice({
        status: "ready",
        models: [model],
        error: null,
        runError: upstream("RUN_STATE_CONFLICT", "start-run"),
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `FE_VITEST src/shared/ai/modelAvailabilityNotice.test.ts`
Expected: FAIL，找不到 `./modelAvailabilityNotice`

- [ ] **Step 3: 實作純函式**

`frontend/src/shared/ai/modelAvailabilityNotice.ts`：

```ts
import type { CopilotError, CopilotModel, CopilotModelStatus } from "@copilot";

export type ModelAvailabilityNotice =
  | { kind: "config-invalid" | "no-models" | "service-unavailable"; blocking: true }
  | { kind: "model-not-available"; blocking: false };

export const MODEL_NOTICE_I18N_KEY: Record<ModelAvailabilityNotice["kind"], string> = {
  "config-invalid": "errors.aiModelConfigInvalid",
  "no-models": "errors.aiNoModelsConfigured",
  "service-unavailable": "errors.aiServiceUnavailable",
  "model-not-available": "errors.aiModelNotAvailable",
};

/** AI Service error code carried by a failed request, through wrapped causes. */
export function aiErrorCode(cause: unknown): string | undefined {
  let current: unknown = cause;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const envelope = (current as { envelope?: unknown }).envelope;
    if (envelope && typeof envelope === "object") {
      const error = (envelope as { error?: unknown }).error;
      const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
      if (typeof code === "string") return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function modelAvailabilityNotice(input: {
  status: CopilotModelStatus;
  models: readonly CopilotModel[];
  error: CopilotError | null;
  runError?: CopilotError | null;
}): ModelAvailabilityNotice | null {
  if (input.status === "error") {
    return aiErrorCode(input.error) === "MODEL_CONFIG_INVALID"
      ? { kind: "config-invalid", blocking: true }
      : { kind: "service-unavailable", blocking: true };
  }
  if (input.status === "ready" && input.models.length === 0) {
    return { kind: "no-models", blocking: true };
  }
  if (
    input.runError?.operation === "start-run" &&
    aiErrorCode(input.runError) === "MODEL_NOT_AVAILABLE"
  ) {
    return { kind: "model-not-available", blocking: false };
  }
  return null;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `FE_VITEST src/shared/ai/modelAvailabilityNotice.test.ts`
Expected: PASS（6 passed）

- [ ] **Step 5: 翻譯字串**

在四個 `chatbot.json` 的 `"errors"` 物件加入三個 key（ja、ko 沿用該檔現行的英文字串慣例）：

zh-TW：

```json
    "aiModelConfigInvalid": "AI 模型設定有誤，AI 功能暫時無法使用。請聯絡站台管理員檢查 AI 模型設定。",
    "aiModelNotAvailable": "所選模型目前無法使用，模型清單已重新整理，請改選其他模型後再送出。",
    "aiNoModelsConfigured": "此站台尚未設定 AI 模型，請聯絡站台管理員。",
```

en、ja、ko：

```json
    "aiModelConfigInvalid": "AI model settings are invalid, so AI features are unavailable. Please ask the site administrator to check the AI model settings.",
    "aiModelNotAvailable": "The selected model is currently unavailable. The model list has been refreshed; choose another model and send again.",
    "aiNoModelsConfigured": "No AI models are configured for this site. Please contact the site administrator.",
```

依各檔 key 的字母順序插入。

- [ ] **Step 6: 寫失敗的 ComposerBar 測試**

在 `ComposerBar.test.tsx` 新增：

```tsx
describe("ComposerBar model notice", () => {
  it("shows the model notice as an inline warning", () => {
    render(
      <ComposerBar
        {...baseProps}
        attachments={[]}
        modelNotice="此站台尚未設定 AI 模型，請聯絡站台管理員。"
      />,
    );
    expect(screen.getByText("此站台尚未設定 AI 模型，請聯絡站台管理員。")).toBeInTheDocument();
  });
});
```

Run: `FE_VITEST src/features/chatbot/components/chat-ui/ComposerBar.test.tsx`
Expected: FAIL（找不到文字）

- [ ] **Step 7: 實作 ComposerBar 與 Composer 接線**

`ComposerBar.tsx`：
- `@carbon/react` 的 import 加入 `InlineNotification`（若該檔還沒有 `@carbon/react` import，就新增一行 `import { InlineNotification } from "@carbon/react";`）。
- `ComposerBarProps` 在 `sessionNotice?: string | null;` 下方加 `modelNotice?: string | null;`，函式參數解構加入 `modelNotice`。
- `const hasStatusBlock = Boolean(sessionNotice);` 改為 `const hasStatusBlock = Boolean(sessionNotice || modelNotice);`
- 在 `<div className={styles.statusStack}>` 內、`{sessionNotice && (` 之前加入：

```tsx
          {modelNotice && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={modelNotice}
            />
          )}
```

`QJudgeCopilotSlotComponents.tsx` 的 `QJudgeCopilotComposer`：
- import `useEffect`、`useRef`（從 `react`）、`useTranslation`（若尚未 import）、`type CopilotError`（從 `@copilot`），以及 `import { MODEL_NOTICE_I18N_KEY, modelAvailabilityNotice } from "@/shared/ai/modelAvailabilityNotice";`
- 在 `const disabled = ...` 之前加入：

```tsx
  const { t } = useTranslation("chatbot");
  const runError = run.state.status === "error" ? run.state.error : null;
  const modelNotice = modelAvailabilityNotice({
    status: models.status,
    models: models.models,
    error: models.error,
    runError,
  });
  const refreshedForRef = useRef<CopilotError | null>(null);
  const { refresh: refreshModels } = models;
  useEffect(() => {
    // A removed model only surfaces when a send fails; reload the list once per failure.
    if (modelNotice?.kind !== "model-not-available" || !runError) return;
    if (refreshedForRef.current === runError) return;
    refreshedForRef.current = runError;
    void refreshModels();
  }, [modelNotice?.kind, refreshModels, runError]);
```

- `disabled` 改為 `!sessionAcceptsInput || isAwaitingHumanInput || composer.isSending || Boolean(modelNotice?.blocking);`
- `<ComposerBar` 加 `modelNotice={modelNotice ? t(MODEL_NOTICE_I18N_KEY[modelNotice.kind]) : null}`

Run: `FE_VITEST src/features/chatbot/components/chat-ui/ComposerBar.test.tsx src/shared/ai/modelAvailabilityNotice.test.ts`
Expected: PASS

- [ ] **Step 8: 批改畫面改用目錄預設並顯示訊息**

`useAiQuestionGrading.ts`：
- 刪除 `export const AI_GRADING_DEFAULT_MODEL_ID = "deepseek-v4-flash";`
- 第 410 行改為 `const modelId = options?.modelId;`
- 第 500 行改為 `modelOverride: options?.modelId,`
- 若 `modelId` 之後被存入型別為 `string` 的 state，改為 `string | undefined` 或在該處使用 `modelId ?? ""`，以 `npm run typecheck` 為準。

`ContestAiGradingScreen.tsx`：
- 刪除 `EXCLUDED_MODEL_IDS` 常數與 `AI_GRADING_DEFAULT_MODEL_ID` import，`gradingModels` 的 `.filter(...)` 一行刪掉。
- `import { InlineNotification, Loading } from "@carbon/react";`，並 import `MODEL_NOTICE_I18N_KEY, modelAvailabilityNotice`。
- `const { models, select: selectModel } = useCopilotModels();` 改為 `const { models, status: modelStatus, error: modelError, select: selectModel } = useCopilotModels();`，下方加入：

```tsx
  const { t: tChatbot } = useTranslation("chatbot");
  const modelNotice = modelAvailabilityNotice({ status: modelStatus, models, error: modelError });
```

- `useState<string>(AI_GRADING_DEFAULT_MODEL_ID)` 改為 `useState<string>("")`。
- 選預設的 effect 改為：

```tsx
  // Default to the catalog's default model once the list is available.
  useEffect(() => {
    if (gradingModels.length === 0) return;
    setModelId((prev) =>
      gradingModels.some((m) => m.model_id === prev)
        ? prev
        : (gradingModels.find((m) => m.is_default) ?? gradingModels[0]).model_id,
    );
  }, [gradingModels]);
```

- 在 `<div className={styles.shellRoot}>` 內、`<AITaskShell` 之前加入：

```tsx
      {modelNotice && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={tChatbot(MODEL_NOTICE_I18N_KEY[modelNotice.kind])}
        />
      )}
```

- [ ] **Step 9: 清掉其他引用並跑前端檢查**

Run: `grep -rn "AI_GRADING_DEFAULT_MODEL_ID\|EXCLUDED_MODEL_IDS" frontend/src`
Expected: 無結果（`chatbot.repository.test.ts`、`ComposerBar.stories.tsx` 中的 `openai-nano`／`deepseek-v4-flash` 只是 fixture，保留即可）

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck`
Run: `FE_VITEST src/shared/ai src/features/chatbot/components/chat-ui src/features/contest/screens/settings`
Run: `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src`
Run: `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src`
Run: `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`
Expected: 全部通過。若 architecture lint 不允許 `features/contest` 引用 `shared/ai`，改依 lint 訊息指定的層級放置，不要加入 baseline。

- [ ] **Step 10: 實際畫面檢查**

用 `qjudge-dc.sh dev` 起前端，在瀏覽器以 teacher 帳號確認四種狀態（每次改 `deploy/ai/models.yml` 後 `qjudge-dc.sh dev up -d --force-recreate ai-service ai-worker`）：

1. 正常設定：AI 助教輸入框可送出、選單列出設定的模型；批改畫面預設選中 `default`。
2. `provider: nowhere`：輸入框上方顯示「AI 模型設定有誤…」，無法送出；批改畫面同樣顯示。
3. `models: []`：顯示「此站台尚未設定 AI 模型…」。
4. 先選一個模型，再從 yaml 移除它並重啟，不重新整理頁面直接送出：顯示「所選模型目前無法使用…」，選單自動更新。

各檢查一次桌面寬度與手機寬度（375px）；確認訊息不擠壓輸入框。檢查完把 `models.yml` 改回正常設定。

- [ ] **Step 11: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): explain AI model availability and use the catalog default"
```

---

### Task 9: 文件與技能

**Files:**
- Rewrite: `.codex/skills/qjudge-ai-model-registry/SKILL.md`
- Modify: `.codex/skills/qjudge-ai-model-registry/references/touch-points.md`
- Modify: `docs/operations/production-configuration.md`（AI provider 段落，含第 102 行附近與 `force-recreate ai-worker` 範例）

**Interfaces:**
- Consumes: Task 1–8 的檔案與指令名稱

- [ ] **Step 1: 改寫技能**

`SKILL.md` 的 `description` 改為「Use when adding a QJudge AI provider adapter, changing how models are configured per host, or editing deploy/ai/models.yml.」內容改為下表與流程：

| Concern | Source of truth |
| --- | --- |
| 本機提供哪些模型、預設、自架 endpoint | `deploy/ai/models.yml`（範本 `deploy/ai/models.example.yml`） |
| API key | `deploy/ai/keys.env`，名稱 `<PROVIDER>_API_KEY` |
| 內建 provider 呼叫方式 | `ai-service/infrastructure/agent/provider_adapters.py` |
| 驗證規則 | `ai-service/infrastructure/agent/model_config.py`（`python -m infrastructure.agent.model_config`） |
| 執行期可用性與預設 | `ai-service/infrastructure/agent/model_catalog.py` |
| 公開目錄 | AI service `GET /v1/models`；前端與 Django 不寫死任何 model ID |

流程段落：
- 換某台機器的模型：只改該機器的 `deploy/ai/models.yml` 與 `keys.env`，重啟 `ai-service`、`ai-worker`，不需要改程式碼或 release。
- 新增內建 provider：在 `provider_adapters.py` 加入 `BUILTIN_PROVIDERS` 名稱、`builtin_max_input_tokens` 分支與 `build_chat_model` 分支，並補 `tests/test_provider_adapters.py`；yaml 格式不變。
- 移除或改名某台機器上的 `id`：歷史 run 顯示原始 ID，不寫 data migration。
- 驗證指令保留原 SKILL 的 ai-service／backend／frontend 三段，檔名改成 `tests/test_provider_adapters.py tests/test_model_config.py tests/test_model_catalog.py tests/test_model_factory.py tests/test_api.py`。
- 保留原本「不重建 pricing 表」與 `references/cost-math.md` 的說明。

`references/touch-points.md` 改為列出上表檔案與 Task 7 的部署檔（`deploy/compose.yml` 的 `env_file`／`/etc/qjudge-ai` 掛載、`release.py` 的 `MODEL_CONFIG_CHECK`、`ci/ai/models.yml`）。

- [ ] **Step 2: 更新維運文件**

`docs/operations/production-configuration.md`：
- AI provider 相關描述改為指向 `deploy/ai/models.yml` 與 `deploy/ai/keys.env`，連到 spec 第 7 節的轉換步驟。
- 「To apply changed AI provider variables」段落改為：改完 `deploy/ai/` 後重啟兩個服務

```sh
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh main \
  up -d --no-deps --force-recreate ai-service ai-worker
```

  並說明可先執行 `qjudge-dc.sh main run --rm --no-deps ai-service python -m infrastructure.agent.model_config` 驗證。

注意：`docs/operations/production-configuration.md` 目前是使用者未追蹤的檔案（`git status` 顯示 `??`）。修改前先確認使用者是否要把它納入這個分支；若不納入，只修改內容、不要 `git add` 它，並在交付時告知。

- [ ] **Step 3: Commit**

```bash
git add .codex/skills/qjudge-ai-model-registry
git commit -m "docs(ai): describe per-host model configuration"
```

---

## 最終驗證

- [ ] `AI_PYTEST tests`：全部通過
- [ ] `BE_PYTEST apps/ai/tests/test_start_run_serializer.py apps/ai/tests/test_bff_contract.py`：通過
- [ ] `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`：通過
- [ ] 前端 `npm run typecheck`、相關 vitest、naming／architecture／Carbon gates：通過
- [ ] `grep -rn "openai-nano\|deepseek-v4-flash\|gemma" ai-service backend/apps frontend/src --include='*.py' --include='*.ts' --include='*.tsx' | grep -v -i "test\|stories\|fixture\|migrations"`：沒有執行路徑上的寫死 ID
- [ ] Task 8 Step 10 的四種畫面狀態都已實際看過
- [ ] CI 的 E2E（`ci/e2e-stack.sh`）在 PR 上通過，確認 fake adapter 搭配 `ci/ai/models.yml` 可正常產生回覆
