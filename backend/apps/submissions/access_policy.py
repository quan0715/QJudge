from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.users.models import User


@dataclass(frozen=True)
class SubmissionAccessError(Exception):
    message: str


class SubmissionAccessPolicy:
    """
    Centralized access policy for submission-related checks.
    """

    @staticmethod
    def is_privileged(user: User, contest: Contest) -> bool:
        if user.is_staff:
            return True
        if getattr(user, "role", "") in ["admin", "teacher"]:
            return True
        if contest.owner_id == user.id:
            return True
        return contest.admins.filter(pk=user.pk).exists()

    @classmethod
    def enforce_contest_submission(cls, user: User, contest: Contest) -> bool:
        """
        Validate contest submission eligibility.
        Returns True when privileged (bypass) and raises SubmissionAccessError otherwise.
        """
        is_privileged = cls.is_privileged(user, contest)
        if is_privileged:
            return True

        if contest.status != "published":
            raise SubmissionAccessError("Contest is not published")

        now = timezone.now()
        if contest.start_time and now < contest.start_time:
            raise SubmissionAccessError("Contest has not started yet")
        if contest.end_time and now > contest.end_time:
            raise SubmissionAccessError("Contest has ended")

        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
        except ContestParticipant.DoesNotExist as exc:
            raise SubmissionAccessError("You are not registered for this contest") from exc

        if participant.has_finished_exam:
            raise SubmissionAccessError(
                "You have finished the exam and cannot submit anymore"
            )
        if participant.exam_status == ExamStatus.PAUSED:
            raise SubmissionAccessError(
                "Your exam is paused. Please resume the exam before submitting."
            )
        if participant.exam_status == ExamStatus.LOCKED:
            raise SubmissionAccessError("You have been locked out of this exam and cannot submit.")

        return False
