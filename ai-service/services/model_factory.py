"""Model factory — abstraction layer for LLM provider switching.

To switch models, change _MODEL_MAP and PRICING. Everything else
(deepagent_runner, routers, config) reads from here.
"""

import logging

from langchain_deepseek import ChatDeepSeek
from langchain_openai import ChatOpenAI

from config import get_settings

logger = logging.getLogger(__name__)

# Canonical model ID -> provider model string (fixed in code, not env-configured)
_MODEL_MAP: dict[str, str] = {
    "openai-nano": "gpt-5-nano",
    "openai-mini": "gpt-5.4-mini",
    "openai-mini-medium": "gpt-5.4-mini",
    "deepseek-r1": "deepseek-reasoner",
    "deepseek-v3": "deepseek-chat",
}

# Canonical model ID -> OpenAI reasoning_effort override (None = no override).
_OPENAI_REASONING_EFFORT: dict[str, str | None] = {
    "openai-nano": None,
    "openai-mini": "low",
    "openai-mini-medium": "medium",
}

_DEFAULT_MODEL_ID = "openai-nano"
_SUMMARIZATION_MODEL_ID = "deepseek-v3"

# Canonical model ID -> known max input tokens.
# Keep this table in-code so summarization thresholds do not depend on
# provider-side runtime profile metadata.
MODEL_MAX_INPUT_TOKENS: dict[str, int] = {
    "openai-nano": 400_000,
    "openai-mini": 272_000,
    "openai-mini-medium": 272_000,
    "deepseek-r1": 128_000,
    "deepseek-v3": 128_000,
}

# Summarization controls derived from model table.
SUMMARIZATION_TRIGGER_FRACTION = 0.70
MODEL_SUMMARY_TRIM_TOKENS: dict[str, int] = {
    "openai-nano": 12_000,
    "openai-mini": 12_000,
    "openai-mini-medium": 12_000,
    "deepseek-r1": 12_000,
    "deepseek-v3": 12_000,
}

# Pricing in cents per million tokens.
# IMPORTANT: keep in sync with backend/apps/ai/credits.py::DEFAULT_MODEL_PRICING.
# A contract test (backend/apps/ai/tests/test_pricing_alignment.py) enforces equality in CI.
PRICING: dict[str, dict[str, int]] = {
    "openai-nano": {"input": 5, "output": 20},
    "openai-mini": {"input": 75, "output": 450},
    "openai-mini-medium": {"input": 75, "output": 450},
    "deepseek-r1": {"input": 55, "output": 219},
    "deepseek-v3": {"input": 7, "output": 28},
}

# Model display info for the /models API
MODEL_INFO = [
    {
        "model_id": "openai-nano",
        "display_name": "gpt-5-nano",
        "description": "快速且成本低，適合日常教學互動",
        "is_default": True,
    },
    {
        "model_id": "openai-mini",
        "display_name": "gpt-5.4-mini (low)",
        "description": "OpenAI 推理模型，低思考強度，平衡速度與品質",
        "is_default": False,
    },
    {
        "model_id": "openai-mini-medium",
        "display_name": "gpt-5.4-mini (medium)",
        "description": "OpenAI 推理模型，中等思考強度，適合複雜批改與推理",
        "is_default": False,
    },
    {
        "model_id": "deepseek-r1",
        "display_name": "DeepSeek R1 (Thinking)",
        "description": "推理能力強，適合複雜操作與測資生成",
        "is_default": False,
    },
    {
        "model_id": "deepseek-v3",
        "display_name": "DeepSeek V3",
        "description": "快速，適合簡單查詢",
        "is_default": False,
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
        """Create an LLM client instance based on canonical model_id."""
        model_string = ModelFactory.resolve_model_string(model_id)
        settings = get_settings()

        model = None
        if model_id.startswith("openai-"):
            api_key = settings.openai_api_key
            reasoning_effort = _OPENAI_REASONING_EFFORT.get(model_id)
            logger.info(
                "Creating ChatOpenAI model=%s (from '%s', reasoning_effort=%s)",
                model_string,
                model_id,
                reasoning_effort,
            )
            openai_kwargs: dict = {
                "model": model_string,
                "api_key": api_key or None,
                "streaming": True,
            }
            if reasoning_effort:
                # Route via Responses API: gpt-5.x + function tools + reasoning_effort
                # is rejected by /v1/chat/completions ("not supported, use /v1/responses").
                # Passing `reasoning` as a dict makes langchain-openai switch to the
                # Responses API automatically.
                openai_kwargs["reasoning"] = {"effort": reasoning_effort}
                openai_kwargs["use_responses_api"] = True
            model = ChatOpenAI(**openai_kwargs)
        else:
            api_key = settings.deepseek_api_key
            logger.info("Creating ChatDeepSeek model=%s (from '%s')", model_string, model_id)
            model = ChatDeepSeek(
                model=model_string,
                api_key=api_key or None,
                streaming=True,
            )
            # ChatDeepSeek ships with profile=None. DeepAgent's
            # compute_summarization_defaults uses fraction-based policies
            # (keep=10% of context) only when profile.max_input_tokens is a
            # real int; otherwise it falls back to keep=("messages", 6),
            # which can't cope with a single 60–80k-token tool result (e.g.
            # list_answers for 131 answers). Stamp a minimal profile so
            # compaction goes through the fraction path.
            max_in = MODEL_MAX_INPUT_TOKENS.get(model_id)
            if isinstance(max_in, int):
                model.profile = {"max_input_tokens": max_in}

        setattr(model, "_qjudge_model_id", model_id)
        setattr(model, "_qjudge_model_name", model_string)
        setattr(model, "_qjudge_max_input_tokens", ModelFactory.get_model_max_input_tokens(model_id))
        setattr(
            model,
            "_qjudge_summarization_trim_tokens",
            ModelFactory.get_summary_trim_tokens(model_id),
        )
        setattr(model, "_qjudge_summarization_trigger_fraction", SUMMARIZATION_TRIGGER_FRACTION)
        return model

    @staticmethod
    def get_model_max_input_tokens(model_id: str) -> int | None:
        return MODEL_MAX_INPUT_TOKENS.get(model_id)

    @staticmethod
    def get_summary_trim_tokens(model_id: str) -> int:
        return MODEL_SUMMARY_TRIM_TOKENS.get(model_id, 12_000)
