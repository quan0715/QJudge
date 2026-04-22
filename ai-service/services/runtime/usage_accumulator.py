"""Usage accumulation for LangGraph stream events."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Callable

from services.event_adapter import UsageReport


class UsageAccumulator:
    """Collect model token usage from LangGraph `on_chat_model_end` events."""

    def __init__(self) -> None:
        self._total_input_tokens = 0
        self._total_output_tokens = 0

    @property
    def total_input_tokens(self) -> int:
        return self._total_input_tokens

    @property
    def total_output_tokens(self) -> int:
        return self._total_output_tokens

    def ingest_langgraph_event(self, event: Mapping[str, Any]) -> None:
        if event.get("event") != "on_chat_model_end":
            return

        usage_meta = event.get("data", {}).get("output", None)
        if not usage_meta or not hasattr(usage_meta, "usage_metadata"):
            return

        usage_metadata = usage_meta.usage_metadata
        if not isinstance(usage_metadata, Mapping):
            return

        self._total_input_tokens += int(usage_metadata.get("input_tokens", 0) or 0)
        self._total_output_tokens += int(usage_metadata.get("output_tokens", 0) or 0)

    def build_usage_report(
        self,
        *,
        model_id: str,
        calculate_cost: Callable[[str, int, int], int],
    ) -> UsageReport:
        return UsageReport(
            input_tokens=self._total_input_tokens,
            output_tokens=self._total_output_tokens,
            cost_cents=calculate_cost(
                model_id,
                self._total_input_tokens,
                self._total_output_tokens,
            ),
            model_used=model_id,
        )
