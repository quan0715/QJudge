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
