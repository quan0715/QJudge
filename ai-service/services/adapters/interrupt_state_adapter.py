"""Adapter for translating LangGraph interrupt state into approval payloads."""

from __future__ import annotations

from typing import Any


def extract_approval_payload(state: Any) -> tuple[list[dict], list[dict]]:
    """Return (action_requests, review_configs) from LangGraph state interrupts."""
    interrupts = getattr(state, "interrupts", None)
    if not interrupts:
        return ([], [])

    interrupt_val = interrupts[0].value
    if not isinstance(interrupt_val, dict):
        return ([], [])

    action_requests = interrupt_val.get("action_requests", [])
    review_configs = interrupt_val.get("review_configs", [])
    return (
        action_requests if isinstance(action_requests, list) else [],
        review_configs if isinstance(review_configs, list) else [],
    )
