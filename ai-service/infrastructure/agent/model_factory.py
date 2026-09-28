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
