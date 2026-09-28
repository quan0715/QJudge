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
    - A prior non-thinking model turn produces assistant messages with no
      reasoning_content at all.

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
        # OpenAI reasoning models need the Responses API for tool calling.
        # `summary=auto` returns reasoning blocks in the stream, and
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
