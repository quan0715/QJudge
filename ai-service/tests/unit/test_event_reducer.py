"""Unit tests for the framework-free run event projection."""

from __future__ import annotations

from dataclasses import replace
from uuid import UUID

import pytest

from application.event_reducer import reduce_run_event
from domain.errors import InvalidRunTransition
from domain.models import Message, Run, RunKind, RunStatus, Usage


@pytest.fixture
def run() -> Run:
    return Run(
        id=UUID("00000000-0000-0000-0000-000000000002"),
        session_id=UUID("00000000-0000-0000-0000-000000000001"),
        status=RunStatus.RUNNING,
        kind=RunKind.CHAT,
        model_id="test-model",
    )


@pytest.fixture
def assistant(run: Run) -> Message:
    return Message(
        session_id=run.session_id,
        ordinal=2,
        run_id=run.id,
        role="assistant",
        content="",
    )


@pytest.mark.parametrize(
    ("event", "expected_status"),
    [
        ({"type": "awaiting_approval", "action_requests": []}, RunStatus.AWAITING_APPROVAL),
        ({"type": "awaiting_user_answer", "question": "Name?"}, RunStatus.AWAITING_USER_ANSWER),
        ({"type": "run_completed"}, RunStatus.COMPLETED),
        (
            {"type": "run_failed", "error_code": "AGENT_ERROR", "message": "failed"},
            RunStatus.FAILED,
        ),
        ({"type": "run_cancelled"}, RunStatus.CANCELLED),
    ],
)
def test_reduce_event_applies_status(
    event: dict[str, object],
    expected_status: RunStatus,
    run: Run,
    assistant: Message,
) -> None:
    projection = reduce_run_event(run, assistant, event)

    assert projection.run.status is expected_status


def test_pause_events_replace_pause_payload(run: Run, assistant: Message) -> None:
    approval = reduce_run_event(
        run,
        assistant,
        {
            "type": "awaiting_approval",
            "action_requests": [{"name": "grade"}],
            "review_configs": [{"action_name": "grade"}],
        },
    )
    question = reduce_run_event(
        run,
        assistant,
        {
            "type": "awaiting_user_answer",
            "question": "Which rubric?",
            "options": ["A", "B"],
            "input_type": "choice",
        },
    )

    assert approval.run.pause_payload == {
        "action_requests": [{"name": "grade"}],
        "review_configs": [{"action_name": "grade"}],
    }
    assert question.run.pause_payload == {
        "question": "Which rubric?",
        "options": ["A", "B"],
        "input_type": "choice",
    }


def test_message_delta_appends_to_assistant(run: Run, assistant: Message) -> None:
    projection = reduce_run_event(
        run,
        replace(assistant, content="Hel"),
        {"type": "agent_message_delta", "content": "lo"},
    )

    assert projection.assistant is not None
    assert projection.assistant.content == "Hello"


def test_thinking_delta_appends_to_metadata(run: Run, assistant: Message) -> None:
    projection = reduce_run_event(
        run,
        replace(assistant, metadata={"thinking": "first "}),
        {"type": "thinking_delta", "content": "second"},
    )

    assert projection.assistant is not None
    assert projection.assistant.metadata["thinking"] == "first second"


def test_tool_start_and_finish_update_projection(run: Run, assistant: Message) -> None:
    started = reduce_run_event(
        run,
        assistant,
        {
            "type": "tool_call_started",
            "tool_name": "artifact_read",
            "tool_call_id": "call-1",
            "input_data": {"filename": "rubric.csv"},
        },
    )
    finished = reduce_run_event(
        started.run,
        started.assistant,
        {
            "type": "tool_call_finished",
            "tool_call_id": "call-1",
            "result": {"rows": 2},
            "is_error": False,
        },
    )

    assert finished.assistant is not None
    assert "current_tool" not in finished.assistant.metadata
    assert finished.assistant.metadata["tools_executed"] == [
        {
            "tool_name": "artifact_read",
            "tool_call_id": "call-1",
            "input": {"filename": "rubric.csv"},
            "result": {"rows": 2},
            "is_error": False,
        }
    ]


def test_todo_update_replaces_projected_items(run: Run, assistant: Message) -> None:
    projection = reduce_run_event(
        run,
        replace(assistant, metadata={"todos": [{"id": "old"}]}),
        {
            "type": "todo_update",
            "todos": [{"id": "one", "content": "Grade", "status": "in_progress"}],
        },
    )

    assert projection.assistant is not None
    assert projection.assistant.metadata["todos"] == [
        {"id": "one", "content": "Grade", "status": "in_progress"}
    ]


def test_verification_report_is_appended(run: Run, assistant: Message) -> None:
    report = {"iteration": 1, "passed": False, "issues": ["missing row"], "summary": "retry"}
    projection = reduce_run_event(
        run,
        assistant,
        {"type": "verification_report", **report},
    )

    assert projection.assistant is not None
    assert projection.assistant.metadata["verification_reports"] == [report]


def test_next_turn_options_are_projected(run: Run, assistant: Message) -> None:
    options = [{"label": "Again", "message": "Try again"}]
    projection = reduce_run_event(
        run,
        assistant,
        {"type": "run_completed", "next_turn_options": options},
    )

    assert projection.assistant is not None
    assert projection.assistant.metadata["next_turn_options"] == options


def test_usage_report_replaces_absolute_totals(run: Run, assistant: Message) -> None:
    prior = replace(run, usage=Usage(input_tokens=99, output_tokens=88))
    projection = reduce_run_event(
        prior,
        assistant,
        {"type": "usage_report", "input_tokens": 12, "output_tokens": 7},
    )

    assert projection.run.usage == Usage(input_tokens=12, output_tokens=7)
    assert projection.assistant is not None
    assert projection.assistant.metadata["usage"] == {
        "input_tokens": 12,
        "output_tokens": 7,
    }


def test_usage_report_accepts_the_run_id_added_by_the_transport_boundary(
    run: Run, assistant: Message
) -> None:
    projection = reduce_run_event(
        run,
        assistant,
        {
            "type": "usage_report",
            "run_id": str(run.id),
            "input_tokens": 12,
            "output_tokens": 7,
        },
    )

    assert projection.run.usage == Usage(input_tokens=12, output_tokens=7)


@pytest.mark.parametrize(
    "event",
    [
        {"type": "usage_report", "input_tokens": -1, "output_tokens": 0},
        {"type": "usage_report", "input_tokens": 0, "output_tokens": -1},
        {"type": "usage_report", "input_tokens": True, "output_tokens": 0},
        {"type": "usage_report", "input_tokens": 0, "output_tokens": 1.5},
        {
            "type": "usage_report",
            "input_tokens": 0,
            "output_tokens": 0,
            "model_used": "must-not-persist",
        },
        {
            "type": "usage_report",
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_cents": 0,
        },
    ],
)
def test_usage_report_rejects_invalid_token_totals(
    event: dict[str, object], run: Run, assistant: Message
) -> None:
    with pytest.raises(ValueError):
        reduce_run_event(run, assistant, event)


def test_cancelled_run_ignores_late_non_cancel_event(run: Run, assistant: Message) -> None:
    cancelled = replace(run, status=RunStatus.CANCELLED, cancel_requested=True)

    projection = reduce_run_event(
        cancelled,
        assistant,
        {"type": "agent_message_delta", "content": "too late"},
    )

    assert projection.run == cancelled
    assert projection.assistant == assistant


@pytest.mark.parametrize(
    "terminal_event",
    [
        {"type": "run_completed"},
        {"type": "run_failed", "error_code": "AGENT_ERROR", "message": "failed"},
        {"type": "run_cancelled"},
    ],
)
def test_cancelled_run_rejects_late_terminal_event(
    terminal_event: dict[str, object], run: Run, assistant: Message
) -> None:
    cancelled = replace(run, status=RunStatus.CANCELLED, cancel_requested=True)

    with pytest.raises(InvalidRunTransition):
        reduce_run_event(cancelled, assistant, terminal_event)


def test_second_terminal_transition_is_rejected(run: Run, assistant: Message) -> None:
    completed = replace(run, status=RunStatus.COMPLETED)

    with pytest.raises(InvalidRunTransition):
        reduce_run_event(completed, assistant, {"type": "run_completed"})
