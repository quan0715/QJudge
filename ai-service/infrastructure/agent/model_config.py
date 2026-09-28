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
    if default_id is not None and not isinstance(default_id, str):
        problems.append("default: must be a model id string")
    elif default_id is not None and default_id not in {model.id for model in models}:
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
        if model_id in seen:
            problems.append(f"{where}.id: duplicate")
            continue
        seen.add(model_id)
        endpoint = _endpoint_for(item.get("provider"), endpoints)
        if endpoint is None:
            problems.append(f"{where}.provider: must be openai, deepseek or a name under endpoints")
            continue
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
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
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
