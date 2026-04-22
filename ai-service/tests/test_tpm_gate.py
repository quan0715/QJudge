"""Unit tests for services.tpm_gate."""
from __future__ import annotations

import asyncio
import time

import pytest

from services.tpm_gate import (
    TpmBudget,
    estimate_input_tokens,
    get_or_create_budget,
    reset_budgets_for_tests,
)


@pytest.fixture(autouse=True)
def _reset_budget_registry():
    reset_budgets_for_tests()
    yield
    reset_budgets_for_tests()


def test_estimate_input_tokens_string():
    assert estimate_input_tokens("") == 1  # 空字串安全最小值
    # 12 chars / 4 = 3 tokens
    assert estimate_input_tokens("hello world!") == 3


def test_estimate_input_tokens_messages_list():
    messages = [
        {"role": "user", "content": "a" * 400},
        {"role": "assistant", "content": "b" * 200},
    ]
    # (400 + 200) / 4 = 150
    assert estimate_input_tokens(messages) == 150


def test_estimate_input_tokens_state_dict():
    state = {
        "messages": [
            {"role": "user", "content": "x" * 800},
        ],
        "extra": "ignored",
    }
    assert estimate_input_tokens(state) == 200


def test_estimate_input_tokens_handles_none():
    assert estimate_input_tokens(None) == 0


@pytest.mark.asyncio
async def test_budget_allows_within_limit():
    budget = TpmBudget(tpm_limit=200_000, safety_fraction=0.85)
    # 150K is under 170K safety. Should return immediately.
    start = time.monotonic()
    await budget.wait(150_000)
    elapsed = time.monotonic() - start
    assert elapsed < 0.05


@pytest.mark.asyncio
async def test_budget_blocks_when_over_safety(monkeypatch):
    budget = TpmBudget(tpm_limit=200_000, safety_fraction=0.85)
    # Fill the window to near the safety budget.
    await budget.wait(160_000)
    slept = []

    async def fake_sleep(s):
        slept.append(s)
        # Fast-forward by manually pruning the first entry so the loop exits.
        budget._usage.clear()

    monkeypatch.setattr("services.tpm_gate.asyncio.sleep", fake_sleep)
    await budget.wait(50_000)
    assert slept, "budget.wait did not sleep when over the safety budget"


@pytest.mark.asyncio
async def test_budget_prunes_old_entries():
    budget = TpmBudget(tpm_limit=200_000, safety_fraction=0.85)
    # Manually inject a stale entry outside the 60s window.
    budget._usage.append((time.monotonic() - 120.0, 170_000))
    # Fresh request should fit because the stale entry is pruned.
    start = time.monotonic()
    await budget.wait(50_000)
    elapsed = time.monotonic() - start
    assert elapsed < 0.05


def test_get_or_create_budget_is_shared_per_model_string():
    a = get_or_create_budget("gpt-5.4-mini", tpm_limit=200_000)
    b = get_or_create_budget("gpt-5.4-mini", tpm_limit=200_000)
    c = get_or_create_budget("gpt-5-nano", tpm_limit=400_000)
    assert a is b
    assert a is not c
