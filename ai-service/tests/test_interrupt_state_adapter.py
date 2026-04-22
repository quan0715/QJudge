from __future__ import annotations

import sys
import types
from types import SimpleNamespace

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")
_deepseek_stub.ChatDeepSeek = type("ChatDeepSeek", (), {})
_openai_stub.ChatOpenAI = type("ChatOpenAI", (), {})
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from services.adapters.interrupt_state_adapter import extract_approval_payload


def test_extract_approval_payload_returns_empty_when_no_interrupts():
    state = SimpleNamespace(interrupts=())
    action_requests, review_configs = extract_approval_payload(state)

    assert action_requests == []
    assert review_configs == []


def test_extract_approval_payload_returns_action_and_review_lists():
    interrupt = SimpleNamespace(
        value={
            "action_requests": [{"name": "qjudge_exam", "args": {"action": "create"}}],
            "review_configs": [{"action_name": "qjudge_exam", "allowed_decisions": ["approve"]}],
        }
    )
    state = SimpleNamespace(interrupts=(interrupt,))

    action_requests, review_configs = extract_approval_payload(state)

    assert action_requests == [{"name": "qjudge_exam", "args": {"action": "create"}}]
    assert review_configs == [{"action_name": "qjudge_exam", "allowed_decisions": ["approve"]}]
