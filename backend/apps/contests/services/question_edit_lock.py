"""Contest question edit lock service (single source of truth)."""
from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils import timezone
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


def _log_contest_question_locked(
    *,
    contest: Contest,
    trigger: str,
    actor_id: int | None,
    at,
) -> None:
    logger.info(
        "contest_question_locked contest=%s trigger=%s actor=%s at=%s",
        contest.id,
        trigger,
        actor_id,
        at.isoformat() if at else None,
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


def lock_contest_question_editing(
    *,
    contest: Contest,
    trigger: str,
    actor_id: int | None = None,
) -> bool:
    """
    Lock contest question editing exactly once.

    Returns True when lock is newly set, False when already locked.
    """
    now = timezone.now()
    with transaction.atomic():
        locked_contest = Contest.objects.select_for_update().get(pk=contest.pk)
        if locked_contest.question_edit_locked:
            return False

        locked_contest.question_edit_locked = True
        locked_contest.question_edit_locked_at = now
        locked_contest.question_edit_lock_trigger = trigger
        locked_contest.save(
            update_fields=[
                "question_edit_locked",
                "question_edit_locked_at",
                "question_edit_lock_trigger",
                "updated_at",
            ]
        )

    _log_contest_question_locked(
        contest=contest,
        trigger=trigger,
        actor_id=actor_id,
        at=now,
    )
    return True


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

def maybe_lock_from_coding_submission(*, submission: Submission) -> bool:
    """Lock contest when a student makes the first formal coding submission."""
    contest = submission.contest
    if contest is None:
        return False
    if submission.source_type != "contest":
        return False
    if submission.is_test:
        return False
    if can_manage_contest(submission.user, contest):
        return False
    return lock_contest_question_editing(
        contest=contest,
        trigger=Contest.QuestionEditLockTrigger.CODING_SUBMISSION,
        actor_id=submission.user_id,
    )


def is_non_empty_exam_answer(answer: Any) -> bool:
    if answer is None:
        return False
    if isinstance(answer, str):
        return bool(answer.strip())
    if isinstance(answer, (int, float, bool)):
        return True
    if isinstance(answer, list):
        return any(is_non_empty_exam_answer(item) for item in answer)
    if isinstance(answer, dict):
        return any(is_non_empty_exam_answer(value) for value in answer.values())
    return bool(answer)


def maybe_lock_from_exam_answer(*, exam_answer: ExamAnswer) -> bool:
    """Lock contest when a student writes the first non-empty formal exam answer."""
    participant = exam_answer.participant
    contest = participant.contest
    if not is_non_empty_exam_answer(exam_answer.answer):
        return False
    if can_manage_contest(participant.user, contest):
        return False
    return lock_contest_question_editing(
        contest=contest,
        trigger=Contest.QuestionEditLockTrigger.EXAM_ANSWER,
        actor_id=participant.user_id,
    )
