"""Model factory — abstraction layer for LLM provider switching.

To switch models, change _MODEL_MAP and PRICING. Everything else
(deepagent_runner, routers, config) reads from here.
"""

import logging
from typing import Any

from langchain_core.messages import AIMessage
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_deepseek import ChatDeepSeek
from langchain_openai import ChatOpenAI

from config import get_settings
from services.tpm_gate import (
    TpmBudget,
    estimate_input_tokens,
    get_or_create_budget,
)

logger = logging.getLogger(__name__)


class ReasoningPreservingChatDeepSeek(ChatDeepSeek):
    """ChatDeepSeek variant that echoes prior ``reasoning_content``.

    DeepSeek V4 thinking mode requires **every** assistant message in the
    request history to carry a ``reasoning_content`` field. If any prior
    assistant message omits it, the API returns 400 ``reasoning_content
    ... must be passed back``.

    LangChain captures the field into ``AIMessage.additional_kwargs`` on
    the way in but drops it when serializing messages back out, so on
    multi-turn calls we re-attach it. But additional_kwargs alone isn't
    enough:

    - LangGraph checkpoint restoration, SummarizationMiddleware, DeepAgent
      sub-agents, and any code path that reconstructs an ``AIMessage``
      from content only will leave ``additional_kwargs`` empty.
    - A non-thinking model turn (e.g. when the user previously ran the
      session on ``deepseek-v4`` without thinking) produces assistant
      messages with no reasoning_content at all.

    For those cases a blank ``reasoning_content=""`` is accepted by the
    DeepSeek API (verified empirically) and preserves the turn; without
    it the entire request is rejected. Populate every assistant payload
    slot: real value from ``additional_kwargs`` when available, empty
    string otherwise.
    """

    def _get_request_payload(self, input_, *, stop=None, **kwargs):  # type: ignore[override]
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)
        messages = payload.get("messages")
        if not messages:
            return payload
        input_list = list(input_) if not isinstance(input_, list) else input_
        ai_iter = iter(m for m in input_list if isinstance(m, AIMessage))
        for md in messages:
            if md.get("role") != "assistant":
                continue
            try:
                lm = next(ai_iter)
            except StopIteration:
                lm = None
            rc = ""
            if lm is not None:
                rc = (lm.additional_kwargs or {}).get("reasoning_content") or ""
            md["reasoning_content"] = rc
        return payload


class TpmGatedChatOpenAI(ChatOpenAI):
    """``ChatOpenAI`` variant that pauses for a rolling-60 s TPM budget.

    The budget is attached per-instance via ``_qjudge_tpm_budget`` (set
    in :func:`ModelFactory.create_model`). If no budget is attached,
    behaviour is identical to :class:`ChatOpenAI` — this class is a
    drop-in replacement and safe to use for non-gated models too.

    We override the public ``ainvoke`` / ``astream`` entry points. DeepAgent
    and LangGraph both call one of these for every model turn, so gating
    here catches every call that would otherwise contribute to TPM.
    """

    async def ainvoke(self, input, config=None, *, stop=None, **kwargs):  # type: ignore[override]
        budget: TpmBudget | None = getattr(self, "_qjudge_tpm_budget", None)
        if budget is not None:
            await budget.wait(estimate_input_tokens(input))
        return await super().ainvoke(input, config, stop=stop, **kwargs)

    async def astream(self, input, config=None, *, stop=None, **kwargs):  # type: ignore[override]
        budget: TpmBudget | None = getattr(self, "_qjudge_tpm_budget", None)
        if budget is not None:
            await budget.wait(estimate_input_tokens(input))
        async for chunk in super().astream(input, config, stop=stop, **kwargs):
            yield chunk

# Canonical model ID -> provider model string (fixed in code, not env-configured)
_MODEL_MAP: dict[str, str] = {
    "openai-nano": "gpt-5-nano",
    "openai-mini": "gpt-5.4-mini",
    "openai-mini-medium": "gpt-5.4-mini",
    "deepseek-v4": "deepseek-v4-flash",
    "deepseek-v4-flash": "deepseek-v4-flash",
    "deepseek-v4-pro": "deepseek-v4-pro",
    "deepseek-v4-thinking": "deepseek-v4-flash",
}

# Canonical model ID -> OpenAI reasoning_effort override (None = no override).
_OPENAI_REASONING_EFFORT: dict[str, str | None] = {
    "openai-nano": None,
    "openai-mini": "low",
    "openai-mini-medium": "medium",
}

# Canonical model ID -> max model invocations per second. gpt-5.4-mini ships
# with a 200K TPM limit that is easy to hit during grading bursts (each model
# call can carry ~80K prompt tokens). A ~0.5s spacing gives the TPM window
# time to roll and avoids 429s without serializing everything unnecessarily.
_OPENAI_RATE_LIMIT_RPS: dict[str, float] = {
    "openai-mini": 2.0,
    "openai-mini-medium": 2.0,
}

# Canonical model ID -> upstream TPM limit (tokens per minute). Used by the
# proactive TPM gate. Both openai-mini* variants resolve to ``gpt-5.4-mini``
# on the OpenAI side and share the same quota; the gate keys on the provider
# model string so the budget is shared across them.
_OPENAI_TPM_LIMIT: dict[str, int] = {
    "openai-mini": 200_000,
    "openai-mini-medium": 200_000,
}

# Canonical model ID -> OpenAI SDK ``max_retries``. Raised from the SDK
# default (2) for models prone to transient 429s; the SDK honours
# ``Retry-After`` with exponential backoff so most TPM breaches that slip
# past the gate self-heal without surfacing to the user.
_OPENAI_MAX_RETRIES: dict[str, int] = {
    "openai-mini": 6,
    "openai-mini-medium": 6,
}

_DEFAULT_MODEL_ID = "openai-nano"
_SUMMARIZATION_MODEL_ID = "deepseek-v4"

# Canonical model ID -> known max input tokens.
# Keep this table in-code so summarization thresholds do not depend on
# provider-side runtime profile metadata.
MODEL_MAX_INPUT_TOKENS: dict[str, int] = {
    "openai-nano": 400_000,
    "openai-mini": 272_000,
    "openai-mini-medium": 272_000,
    "deepseek-v4": 1_000_000,
    "deepseek-v4-flash": 1_000_000,
    "deepseek-v4-pro": 1_000_000,
    "deepseek-v4-thinking": 1_000_000,
}

# Summarization controls derived from model table.
SUMMARIZATION_TRIGGER_FRACTION = 0.70
MODEL_SUMMARY_TRIM_TOKENS: dict[str, int] = {
    "openai-nano": 12_000,
    "openai-mini": 12_000,
    "openai-mini-medium": 12_000,
    "deepseek-v4": 12_000,
    "deepseek-v4-flash": 12_000,
    "deepseek-v4-pro": 12_000,
    "deepseek-v4-thinking": 12_000,
}

# Pricing in cents per million tokens.
# IMPORTANT: keep in sync with backend/apps/ai/credits.py::DEFAULT_MODEL_PRICING.
# A contract test (backend/apps/ai/tests/test_pricing_alignment.py) enforces equality in CI.
PRICING: dict[str, dict[str, int]] = {
    "openai-nano": {"input": 5, "output": 20},
    "openai-mini": {"input": 75, "output": 450},
    "openai-mini-medium": {"input": 75, "output": 450},
    "deepseek-v4": {"input": 14, "output": 28},
    "deepseek-v4-flash": {"input": 14, "output": 28},
    "deepseek-v4-pro": {"input": 55, "output": 219},
    "deepseek-v4-thinking": {"input": 14, "output": 28},
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
        "model_id": "deepseek-v4",
        "display_name": "deepseek-v4",
        "description": "1M context、快速、低成本，適合日常對話與 summarization（非推理模式）",
        "is_default": False,
    },
    {
        "model_id": "deepseek-v4-thinking",
        "display_name": "deepseek-v4 (thinking)",
        "description": "1M context、推理模式（reasoning_effort=low），適合複雜批改與測資生成",
        "is_default": False,
    },
]


class ModelFactory:
    """Factory for creating LLM model instances."""

    @staticmethod
    def canonicalize_model_id(model_id: str) -> str:
        """Return a safe canonical id that is guaranteed present in ``_MODEL_MAP``.

        Unknown id → default. Callers must branch on the canonicalized id
        (provider selection, thinking toggle) so a stale / typo id can't
        leak the wrong provider string into the wrong SDK.
        """
        if model_id in _MODEL_MAP:
            return model_id
        logger.warning(
            "Unknown model_id '%s', falling back to default '%s'",
            model_id,
            _DEFAULT_MODEL_ID,
        )
        return _DEFAULT_MODEL_ID

    @staticmethod
    def resolve_model_string(model_id: str) -> str:
        canonical = ModelFactory.canonicalize_model_id(model_id)
        return _MODEL_MAP[canonical]

    @staticmethod
    def create_model(model_id: str = _DEFAULT_MODEL_ID):
        """Create an LLM client instance based on canonical model_id."""
        model_id = ModelFactory.canonicalize_model_id(model_id)
        model_string = _MODEL_MAP[model_id]
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
            rate_limit_rps = _OPENAI_RATE_LIMIT_RPS.get(model_id)
            if rate_limit_rps:
                # LangChain waits on this limiter before each model invocation.
                openai_kwargs["rate_limiter"] = InMemoryRateLimiter(
                    requests_per_second=rate_limit_rps,
                    check_every_n_seconds=0.1,
                    max_bucket_size=1,
                )
            max_retries = _OPENAI_MAX_RETRIES.get(model_id)
            if max_retries is not None:
                # OpenAI SDK will honour Retry-After on 429s across retries.
                openai_kwargs["max_retries"] = max_retries
            if reasoning_effort:
                # Route via Responses API: gpt-5.x + function tools + reasoning_effort
                # is rejected by /v1/chat/completions ("not supported, use /v1/responses").
                # Passing `reasoning` as a dict makes langchain-openai switch to the
                # Responses API automatically. `summary=auto` is required to actually
                # receive reasoning blocks in the stream — without it OpenAI performs
                # internal reasoning but emits no reasoning output, so the frontend sees
                # only tool calls + final text. `output_version=responses/v1` puts the
                # reasoning summaries into message.content as `{type: "reasoning"}`
                # blocks (event_adapter already handles both this and additional_kwargs).
                openai_kwargs["reasoning"] = {
                    "effort": reasoning_effort,
                    "summary": "auto",
                }
                openai_kwargs["use_responses_api"] = True
                openai_kwargs["output_version"] = "responses/v1"
            model = TpmGatedChatOpenAI(**openai_kwargs)
            tpm_limit = _OPENAI_TPM_LIMIT.get(model_id)
            if tpm_limit:
                # Shared per upstream model string so openai-mini and
                # openai-mini-medium contend for the same 200K/min budget.
                setattr(
                    model,
                    "_qjudge_tpm_budget",
                    get_or_create_budget(model_string, tpm_limit),
                )
        else:
            api_key = settings.deepseek_api_key
            thinking = model_id == "deepseek-v4-thinking"
            logger.info(
                "Creating ChatDeepSeek model=%s (from '%s', thinking=%s)",
                model_string,
                model_id,
                thinking,
            )
            # V4 ships with thinking ON by default. The API requires each
            # prior assistant turn to echo its own reasoning_content back;
            # plain ChatDeepSeek strips that field so multi-turn fails with
            # 400. For the explicit thinking variant we use
            # ``ReasoningPreservingChatDeepSeek`` which re-attaches it at
            # request time. For the default "deepseek-v4" we disable
            # thinking entirely (V3-style fast chat).
            deepseek_cls = ReasoningPreservingChatDeepSeek if thinking else ChatDeepSeek
            deepseek_kwargs: dict[str, Any] = {
                "model": model_string,
                "api_key": api_key or None,
                "streaming": True,
                "extra_body": {
                    "thinking": {"type": "enabled" if thinking else "disabled"}
                },
            }
            if thinking:
                deepseek_kwargs["reasoning_effort"] = "low"
            model = deepseek_cls(**deepseek_kwargs)
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
