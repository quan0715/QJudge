"""Tests for ActionAwareHITLMiddleware.

The middleware wraps LangGraph's ``interrupt()`` primitive, so these tests
patch it with a mock that deterministically returns decisions. The goal is to
verify the filter (name + args.action) and the decision-handling logic
independent of a running LangGraph instance.
"""

from __future__ import annotations

import os
from unittest.mock import Mock, patch

import pytest

os.environ.setdefault("AI_INTERNAL_TOKEN", "test-ai-internal-token")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-deepseek-key")

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage  # noqa: E402

from services.hitl_middleware import ActionAwareHITLMiddleware  # noqa: E402


WRITE_ACTIONS = {
    "qjudge_grading": {"grade", "batch_grade", "ungrade"},
    "qjudge_contest_manager": {"reorder"},
    "qjudge_coding_problems": {"create", "update", "delete", "import_from_bank", "update_score"},
    "qjudge_exam": {
        "create",
        "update",
        "delete",
        "import_from_bank",
        "batch_create",
    },
    "qjudge_bank": {
        "create",
        "update",
        "delete",
        "reorder",
        "import_from_bank",
        "batch_create",
    },
}


def _make_state(*tool_calls: dict) -> dict:
    """Build an AgentState-compatible dict with an AIMessage containing tool_calls."""
    ai_msg = AIMessage(content="", tool_calls=list(tool_calls))
    return {"messages": [HumanMessage(content="ping"), ai_msg]}


def _make_middleware() -> ActionAwareHITLMiddleware:
    return ActionAwareHITLMiddleware(
        write_actions=WRITE_ACTIONS,
        allowed_decisions=["approve", "reject"],
    )


def _tool_call(name: str, args: dict, call_id: str = "call_1") -> dict:
    return {"type": "tool_call", "name": name, "args": args, "id": call_id}


class TestWriteActionFiltering:
    def test_grade_action_triggers_interrupt(self):
        mw = _make_middleware()
        state = _make_state(
            _tool_call("qjudge_grading", {"action": "grade", "score": 90})
        )
        runtime = Mock()

        with patch(
            "services.hitl_middleware.interrupt",
            return_value={"decisions": [{"type": "approve"}]},
        ) as fake_interrupt:
            mw.after_model(state, runtime)

        assert fake_interrupt.call_count == 1
        payload = fake_interrupt.call_args.args[0]
        assert len(payload["action_requests"]) == 1
        assert payload["action_requests"][0]["name"] == "qjudge_grading"
        assert payload["action_requests"][0]["args"]["action"] == "grade"
        assert payload["review_configs"][0]["action_name"] == "qjudge_grading"
        assert payload["review_configs"][0]["allowed_decisions"] == ["approve", "reject"]

    def test_read_only_action_does_not_trigger(self):
        mw = _make_middleware()
        state = _make_state(
            _tool_call("qjudge_grading", {"action": "list_answers", "contest_id": "c1"})
        )
        runtime = Mock()

        with patch("services.hitl_middleware.interrupt") as fake_interrupt:
            result = mw.after_model(state, runtime)

        fake_interrupt.assert_not_called()
        assert result is None

    def test_coding_create_triggers_interrupt(self):
        mw = _make_middleware()
        state = _make_state(
            _tool_call("qjudge_coding_problems", {"action": "create", "title": "New Problem"})
        )
        runtime = Mock()

        with patch(
            "services.hitl_middleware.interrupt",
            return_value={"decisions": [{"type": "approve"}]},
        ) as fake_interrupt:
            mw.after_model(state, runtime)

        fake_interrupt.assert_called_once()
        assert fake_interrupt.call_args.args[0]["action_requests"][0]["name"] == "qjudge_coding_problems"

    def test_coding_get_does_not_trigger(self):
        mw = _make_middleware()
        state = _make_state(
            _tool_call("qjudge_coding_problems", {"action": "get", "problem_id": "p1"})
        )
        runtime = Mock()

        with patch("services.hitl_middleware.interrupt") as fake_interrupt:
            result = mw.after_model(state, runtime)

        fake_interrupt.assert_not_called()
        assert result is None

    def test_unknown_tool_does_not_trigger(self):
        mw = _make_middleware()
        state = _make_state(
            _tool_call(
                "qjudge_code_runner",
                {"problem_id": "p1", "language": "python", "code": "print(1)"},
            )
        )
        runtime = Mock()

        with patch("services.hitl_middleware.interrupt") as fake_interrupt:
            result = mw.after_model(state, runtime)

        fake_interrupt.assert_not_called()
        assert result is None


class TestDecisionProcessing:
    def test_approve_keeps_tool_call_unchanged(self):
        mw = _make_middleware()
        call = _tool_call("qjudge_grading", {"action": "grade", "score": 85}, "call_a")
        state = _make_state(call)
        runtime = Mock()

        with patch(
            "services.hitl_middleware.interrupt",
            return_value={"decisions": [{"type": "approve"}]},
        ):
            result = mw.after_model(state, runtime)

        assert result is not None
        messages = result["messages"]
        ai_msg = next(m for m in messages if isinstance(m, AIMessage))
        assert len(ai_msg.tool_calls) == 1
        assert ai_msg.tool_calls[0]["id"] == "call_a"
        # No synthetic ToolMessage appended on approve.
        assert not any(isinstance(m, ToolMessage) for m in messages)

    def test_reject_appends_error_tool_message(self):
        mw = _make_middleware()
        call = _tool_call("qjudge_grading", {"action": "grade", "score": 85}, "call_b")
        state = _make_state(call)
        runtime = Mock()

        with patch(
            "services.hitl_middleware.interrupt",
            return_value={"decisions": [{"type": "reject"}]},
        ):
            result = mw.after_model(state, runtime)

        messages = result["messages"]
        tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
        assert len(tool_messages) == 1
        assert tool_messages[0].status == "error"
        assert tool_messages[0].tool_call_id == "call_b"
        assert "rejected" in tool_messages[0].content.lower()


class TestMixedToolCalls:
    def test_only_write_calls_are_interrupted(self):
        mw = _make_middleware()
        write_call = _tool_call(
            "qjudge_coding_problems", {"action": "update", "problem_id": "p1"}, "w1"
        )
        read_call = _tool_call(
            "qjudge_contest_manager", {"action": "list_problems", "contest_id": "c1"}, "r1"
        )
        state = _make_state(write_call, read_call)
        runtime = Mock()

        with patch(
            "services.hitl_middleware.interrupt",
            return_value={"decisions": [{"type": "approve"}]},
        ) as fake_interrupt:
            result = mw.after_model(state, runtime)

        payload = fake_interrupt.call_args.args[0]
        # Only the write call is sent for approval.
        assert len(payload["action_requests"]) == 1
        assert payload["action_requests"][0]["args"]["action"] == "update"
        # Both calls survive on approve.
        ai_msg = next(m for m in result["messages"] if isinstance(m, AIMessage))
        ids = [tc["id"] for tc in ai_msg.tool_calls]
        assert ids == ["w1", "r1"]

    def test_single_decision_fans_out_to_multiple_writes(self):
        mw = _make_middleware()
        call_1 = _tool_call(
            "qjudge_coding_problems", {"action": "create", "title": "A"}, "c1"
        )
        call_2 = _tool_call(
            "qjudge_coding_problems", {"action": "update", "problem_id": "p2"}, "c2"
        )
        state = _make_state(call_1, call_2)
        runtime = Mock()

        with patch(
            "services.hitl_middleware.interrupt",
            return_value={"decisions": [{"type": "reject"}]},
        ):
            result = mw.after_model(state, runtime)

        tool_messages = [m for m in result["messages"] if isinstance(m, ToolMessage)]
        # Fan-out: one decision applied to both writes.
        assert len(tool_messages) == 2
        assert {m.tool_call_id for m in tool_messages} == {"c1", "c2"}


class TestEmptyStates:
    def test_no_messages_returns_none(self):
        mw = _make_middleware()
        runtime = Mock()
        with patch("services.hitl_middleware.interrupt") as fake_interrupt:
            result = mw.after_model({"messages": []}, runtime)
        assert result is None
        fake_interrupt.assert_not_called()

    def test_no_tool_calls_returns_none(self):
        mw = _make_middleware()
        runtime = Mock()
        state = {"messages": [HumanMessage(content="hi"), AIMessage(content="hello")]}
        with patch("services.hitl_middleware.interrupt") as fake_interrupt:
            result = mw.after_model(state, runtime)
        assert result is None
        fake_interrupt.assert_not_called()


@pytest.mark.asyncio
async def test_aafter_model_delegates_to_sync():
    mw = _make_middleware()
    state = _make_state(_tool_call("qjudge_grading", {"action": "grade", "score": 60}))
    runtime = Mock()
    with patch(
        "services.hitl_middleware.interrupt",
        return_value={"decisions": [{"type": "approve"}]},
    ) as fake_interrupt:
        result = await mw.aafter_model(state, runtime)
    assert result is not None
    fake_interrupt.assert_called_once()
