from dataclasses import replace
from uuid import uuid4

import pytest

from domain.errors import InvalidRunTransition
from domain.models import Run, RunKind, RunStatus
from domain.run_state import transition_run


def test_paused_run_can_resume_to_running() -> None:
    run = Run(
        id=uuid4(),
        session_id=uuid4(),
        status=RunStatus.AWAITING_USER_ANSWER,
        kind=RunKind.CHAT,
        model_id="openai-nano",
    )

    assert transition_run(run, RunStatus.RUNNING) == replace(
        run, status=RunStatus.RUNNING
    )


def test_completed_run_cannot_return_to_running() -> None:
    run = Run(
        id=uuid4(),
        session_id=uuid4(),
        status=RunStatus.COMPLETED,
        kind=RunKind.CHAT,
        model_id="openai-nano",
    )

    with pytest.raises(InvalidRunTransition):
        transition_run(run, RunStatus.RUNNING)
