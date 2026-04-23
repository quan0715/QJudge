"""Adapter for translating LangGraph interrupt state into approval payloads."""

from __future__ import annotations

from typing import Any


def extract_interrupt_type(state: Any) -> str | None:
    """Return the interrupt type ("approval" or "ask_user") from state, or None."""
    interrupts = getattr(state, "interrupts", None)
    if not interrupts:
        return None

    interrupt_val = interrupts[0].value
    if not isinstance(interrupt_val, dict):
        return None

    return interrupt_val.get("type")


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


def extract_question_payload(state: Any) -> tuple[str, list[str], str]:
    """Return (question, options, input_type) from an ask_user interrupt.

    Returns empty defaults when no question interrupt is found.
    """
    interrupts = getattr(state, "interrupts", None)
    if not interrupts:
        return ("", [], "text")

    interrupt_val = interrupts[0].value
    if not isinstance(interrupt_val, dict):
        return ("", [], "text")

    question = interrupt_val.get("question", "")
    options = interrupt_val.get("options", [])
    input_type = interrupt_val.get("input_type", "text")
    return (
        question if isinstance(question, str) else "",
        options if isinstance(options, list) else [],
        input_type if isinstance(input_type, str) else "text",
    )
