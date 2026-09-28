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
