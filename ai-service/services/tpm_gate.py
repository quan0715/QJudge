"""Token-per-minute (TPM) budget gate for OpenAI models.

OpenAI enforces a 200K TPM limit on ``gpt-5.4-mini`` that is easy to hit
during grading bursts — each model call can carry 50–80K prompt tokens
once the conversation context grows. This module provides a proactive
gate that estimates input tokens and sleeps to keep the rolling 60 s
usage under a safety budget.

Output tokens are not tracked:

- input tokens dominate the TPM on large reasoning contexts;
- the OpenAI SDK's ``max_retries`` handles any rare output-side breach
  via ``Retry-After``.

Usage
-----

::

    budget = get_or_create_budget("gpt-5.4-mini", tpm_limit=200_000)
    await budget.wait(estimated_tokens=50_000)
    # ... make the model call ...
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Iterable

logger = logging.getLogger(__name__)

_WINDOW_SECONDS = 60.0
# Conservative chars/token ratio for reasoning models. Slightly
# over-estimates so the gate errs on the side of waiting, not blowing
# the limit.
_CHARS_PER_TOKEN_ROUGH = 4


def estimate_input_tokens(input_: Any) -> int:
    """Cheap char/4 token estimate for a LangChain input value.

    Handles strings, LangGraph state dicts (``{"messages": [...]}``),
    lists of messages, and Message-like objects. Falls back to
    stringification for anything unusual; never raises.
    """
    if input_ is None:
        return 0
    if isinstance(input_, str):
        return max(1, len(input_) // _CHARS_PER_TOKEN_ROUGH)
    if isinstance(input_, dict):
        messages = input_.get("messages") or []
        if messages:
            return _estimate_messages(messages)
        return max(1, len(str(input_)) // _CHARS_PER_TOKEN_ROUGH)
    if isinstance(input_, (list, tuple)):
        return _estimate_messages(input_)
    content = getattr(input_, "content", None)
    if isinstance(content, str):
        return max(1, len(content) // _CHARS_PER_TOKEN_ROUGH)
    if isinstance(content, list):
        return max(
            1,
            sum(len(str(getattr(c, "text", c) or "")) for c in content)
            // _CHARS_PER_TOKEN_ROUGH,
        )
    return max(1, len(str(input_)) // _CHARS_PER_TOKEN_ROUGH)


def _estimate_messages(messages: Iterable[Any]) -> int:
    total = 0
    for m in messages:
        if isinstance(m, dict):
            content = m.get("content")
        else:
            content = getattr(m, "content", None)
        if isinstance(content, str):
            total += len(content) // _CHARS_PER_TOKEN_ROUGH
        elif isinstance(content, list):
            total += sum(
                len(str(getattr(c, "text", c) or "")) for c in content
            ) // _CHARS_PER_TOKEN_ROUGH
    return max(1, total)


@dataclass
class TpmBudget:
    """Async rolling-window token budget.

    ``await budget.wait(estimated_tokens)`` before invoking the model.
    The call blocks until the projected rolling-60 s usage plus the new
    request fits under ``safety_budget`` (``tpm_limit * safety_fraction``).
    """

    tpm_limit: int
    safety_fraction: float = 0.85
    _usage: Deque[tuple[float, int]] = field(default_factory=deque, init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)

    @property
    def safety_budget(self) -> int:
        return int(self.tpm_limit * self.safety_fraction)

    def _prune(self, now: float) -> None:
        while self._usage and self._usage[0][0] < now - _WINDOW_SECONDS:
            self._usage.popleft()

    async def wait(self, estimated_tokens: int) -> None:
        estimated = max(1, int(estimated_tokens))
        async with self._lock:
            while True:
                now = time.monotonic()
                self._prune(now)
                current = sum(t for _, t in self._usage)
                if current + estimated <= self.safety_budget:
                    self._usage.append((now, estimated))
                    return
                # Sleep until the oldest entry expires, then re-evaluate.
                oldest_age = now - self._usage[0][0]
                wait_s = max(0.1, _WINDOW_SECONDS - oldest_age + 0.05)
                logger.info(
                    "tpm_gate waiting %.2fs (rolling_used=%d add=%d budget=%d tpm_limit=%d)",
                    wait_s,
                    current,
                    estimated,
                    self.safety_budget,
                    self.tpm_limit,
                )
                await asyncio.sleep(wait_s)


# Keyed by the resolved provider model string (e.g. "gpt-5.4-mini"), not
# our canonical id — variants like openai-mini / openai-mini-medium share
# the same upstream TPM quota on the OpenAI side.
_BUDGETS: dict[str, TpmBudget] = {}


def get_or_create_budget(provider_model_string: str, tpm_limit: int) -> TpmBudget:
    """Return the shared TpmBudget for a provider model string."""
    budget = _BUDGETS.get(provider_model_string)
    if budget is None:
        budget = TpmBudget(tpm_limit=tpm_limit)
        _BUDGETS[provider_model_string] = budget
        logger.info(
            "tpm_gate initialized for %s (limit=%d, safety=%d)",
            provider_model_string,
            tpm_limit,
            budget.safety_budget,
        )
    return budget


def reset_budgets_for_tests() -> None:
    """Test helper: clear the shared budget registry between tests."""
    _BUDGETS.clear()
