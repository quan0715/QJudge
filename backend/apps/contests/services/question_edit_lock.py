"""Contest question edit lock service (single source of truth)."""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.exceptions import APIException

from apps.contests.models import Contest, ExamAnswer
from apps.contests.permissions import can_manage_contest
from apps.submissions.models import Submission

logger = logging.getLogger(__name__)

LOCKED_ERROR_CODE = "CONTEST_QUESTION_EDIT_LOCKED"
LOCKED_ERROR_MESSAGE = "已有考生開始作答，競賽內容已鎖定"


class ContestQuestionEditLocked(APIException):
    """Raised when a contest question mutation is blocked by lock policy."""

    status_code = status.HTTP_409_CONFLICT
    default_code = LOCKED_ERROR_CODE

    def __init__(self) -> None:
        super().__init__(
            detail={
                "code": LOCKED_ERROR_CODE,
                "message": LOCKED_ERROR_MESSAGE,
            }
        )


def _log_contest_question_edit_blocked(*, contest: Contest, actor_id: int | None, action: str | None) -> None:
    logger.info(
        "contest_question_edit_blocked contest=%s actor=%s action=%s",
        contest.id,
        actor_id,
        action or "",
    )


def is_contest_question_edit_locked(contest: Contest) -> bool:
    """Return whether current student exposure evidence locks question content."""
    if contest.contest_type == "paper_exam":
        return (
            contest.registrations.filter(started_at__isnull=False).exists()
            or ExamAnswer.objects.filter(participant__contest=contest).exists()
        )

    submissions = (
        Submission.objects.filter(
            contest=contest,
            source_type="contest",
            is_test=False,
        )
        .select_related("user")
        .iterator()
    )
    return any(
        not can_manage_contest(submission.user, contest)
        for submission in submissions
    )


def lock_contest_for_question_edit(
    *,
    contest: Contest,
    actor_id: int | None = None,
    action: str | None = None,
) -> Contest:
    """Lock the contest row and return it after verifying content is editable."""
    locked_contest = Contest.objects.select_for_update().get(pk=contest.pk)
    ensure_contest_question_editable(
        contest=locked_contest,
        actor_id=actor_id,
        action=action,
    )
    return locked_contest


def ensure_contest_question_editable(
    *,
    contest: Contest,
    actor_id: int | None = None,
    action: str | None = None,
) -> None:
    """Raise 409 if contest question editing is locked."""
    if is_contest_question_edit_locked(contest):
        _log_contest_question_edit_blocked(
            contest=contest,
            actor_id=actor_id,
            action=action,
        )
        raise ContestQuestionEditLocked()
