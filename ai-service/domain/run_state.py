"""The explicit state machine for a single AI run."""

from __future__ import annotations

from dataclasses import replace
from typing import Final

from .errors import InvalidRunTransition
from .models import Run, RunStatus


ACTIVE_EXECUTION_STATUSES: Final[frozenset[RunStatus]] = frozenset(
    {
        RunStatus.RUNNING,
        RunStatus.AWAITING_APPROVAL,
        RunStatus.AWAITING_USER_ANSWER,
    }
)

_ALLOWED_TRANSITIONS: Final[dict[RunStatus, frozenset[RunStatus]]] = {
    RunStatus.QUEUED: frozenset({RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}),
    RunStatus.RUNNING: frozenset(
        {
            RunStatus.AWAITING_APPROVAL,
            RunStatus.AWAITING_USER_ANSWER,
            RunStatus.COMPLETED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
        }
    ),
    RunStatus.AWAITING_APPROVAL: frozenset(
        {RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.AWAITING_USER_ANSWER: frozenset(
        {RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.COMPLETED: frozenset(),
    RunStatus.FAILED: frozenset(),
    RunStatus.CANCELLED: frozenset(),
}


def transition_run(run: Run, target: RunStatus) -> Run:
    """Return a new run after validating its requested state transition."""
    if target not in _ALLOWED_TRANSITIONS[run.status]:
        raise InvalidRunTransition(run.status, target)
    return replace(run, status=target)
