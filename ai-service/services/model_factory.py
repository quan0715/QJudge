"""Model factory for mapping canonical model IDs to Anthropic model strings."""

import logging

from langchain_anthropic import ChatAnthropic

logger = logging.getLogger(__name__)

# Canonical model ID -> Anthropic model string
_MODEL_MAP: dict[str, str] = {
    "claude-haiku": "claude-haiku-4-5-20251001",
    "claude-sonnet": "claude-sonnet-4-6",
    "claude-opus": "claude-opus-4-6",
}

_DEFAULT_MODEL_ID = "claude-sonnet"

# Model display info for the /models API
MODEL_INFO = [
    {
        "model_id": "claude-haiku",
        "display_name": "Haiku 4.5",
        "description": "快速、低成本",
        "is_default": False,
    },
    {
        "model_id": "claude-sonnet",
        "display_name": "Sonnet 4.6",
        "description": "平衡效能與成本",
        "is_default": True,
    },
    {
        "model_id": "claude-opus",
        "display_name": "Opus 4.6",
        "description": "最強推理能力",
        "is_default": False,
    },
]


class ModelFactory:
    """Factory for creating LangChain ChatAnthropic model instances."""

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
    def create_model(
        model_id: str = _DEFAULT_MODEL_ID,
        api_key: str | None = None,
    ) -> ChatAnthropic:
        """Create a ChatAnthropic instance.

        If api_key is None, ChatAnthropic reads from ANTHROPIC_API_KEY env var.
        """
        model_string = ModelFactory.resolve_model_string(model_id)
        logger.info("Creating ChatAnthropic model=%s (from '%s')", model_string, model_id)

        kwargs: dict = {
            "model": model_string,
            "streaming": True,
        }
        if api_key is not None:
            kwargs["api_key"] = api_key

        return ChatAnthropic(**kwargs)
