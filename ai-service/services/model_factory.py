"""Model factory — abstraction layer for LLM provider switching.

To switch models, change _MODEL_MAP and PRICING. Everything else
(deepagent_runner, routers, config) reads from here.
"""

import logging

from langchain_deepseek import ChatDeepSeek

from config import get_settings

logger = logging.getLogger(__name__)

# Canonical model ID -> provider model string
_MODEL_MAP: dict[str, str] = {
    "deepseek-r1": "deepseek-reasoner",
}

_DEFAULT_MODEL_ID = "deepseek-r1"

# Pricing in cents per million tokens (single source of truth)
PRICING: dict[str, dict[str, int]] = {
    "deepseek-r1": {"input": 28, "output": 42},
}

# Model display info for the /models API
MODEL_INFO = [
    {
        "model_id": "deepseek-r1",
        "display_name": "DeepSeek R1",
        "description": "推理能力強，支援 thinking",
        "is_default": True,
    },
]


class ModelFactory:
    """Factory for creating LLM model instances."""

    @staticmethod
    def resolve_model_string(model_id: str) -> str:
        resolved = _MODEL_MAP.get(model_id)
        if resolved is None:
            logger.warning(
                "Unknown model_id '%s', falling back to default '%s'",
                model_id,
                _DEFAULT_MODEL_ID,
            )
            resolved = _MODEL_MAP[_DEFAULT_MODEL_ID]
        return resolved

    @staticmethod
    def create_model(model_id: str = _DEFAULT_MODEL_ID):
        """Create a ChatDeepSeek instance using the platform API key."""
        model_string = ModelFactory.resolve_model_string(model_id)
        api_key = get_settings().deepseek_api_key
        logger.info("Creating ChatDeepSeek model=%s (from '%s')", model_string, model_id)

        return ChatDeepSeek(
            model=model_string,
            api_key=api_key or None,
            streaming=True,
        )
