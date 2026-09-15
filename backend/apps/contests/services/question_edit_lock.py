"""Contest question edit lock service (single source of truth)."""
from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException

from apps.contests.models import Contest, ExamAnswer
from apps.contests.services.participation import attempted_participants

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


def is_contest_question_edit_locked(contest: Contest) -> bool:
    """Return whether anyone sitting a paper exam locks its question content.

    Paper exams lock once any attempt exists -- staff test runs included, the
    same as students; resetting the attempt releases it. Coding contests stay
    editable throughout: a mid-contest change is announced on site instead.
    """
    if contest.contest_type != "paper_exam":
        return False
    return (
        attempted_participants(contest).exists()
        or ExamAnswer.objects.filter(participant__contest=contest).exists()
    )


def lock_contest_for_question_edit(
    *,
    contest: Contest,
) -> Contest:
    """Lock the contest row and return it after verifying content is editable."""
    locked_contest = Contest.objects.select_for_update().get(pk=contest.pk)
    ensure_contest_question_editable(contest=locked_contest)
    return locked_contest


def ensure_contest_question_editable(
    *,
    contest: Contest,
) -> None:
    """Raise 409 if contest question editing is locked."""
    if is_contest_question_edit_locked(contest):
        raise ContestQuestionEditLocked()
