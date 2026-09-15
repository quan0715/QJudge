"""Who may take a contest, and when their attempt record comes into existence.

Eligibility is classroom membership, nothing else: anyone with a role in the
contest's bound classroom may take it -- students, and staff (owner, co-admins,
TAs, platform admins) through exactly the same entry flow. There is no
registration step and no roster sync. The ``ContestParticipant`` row is an
*attempt record* (status, start time, integrity attempt, score) and is created
by the first real exam action -- self check-in or starting the exam -- through
``ensure_candidate_participant``.

A staff attempt is an ordinary attempt record; nothing marks it as a trial.
It shows on the teacher's roster like any other attempt, and staff clear it
with the existing "reset exam record" action once they are done testing.

A contest without a classroom binding has no candidates. The API has no path
that creates one (``ContestViewSet.create`` refuses), so this only ever
applies to legacy or fixture data.
"""

from __future__ import annotations

from django.db.models import Q, QuerySet
from rest_framework.exceptions import PermissionDenied

from apps.classrooms.permissions import get_user_role_in_classroom

from ..models import Contest, ContestParticipant, ExamStatus

NOT_A_CANDIDATE_MESSAGE = "Only members of this contest's classroom can take it."
# The attempt record is created by the first check-in or start, so its absence
# means exactly this -- there is no registration step it could stand for.
NO_ATTEMPT_MESSAGE = "You have not started this exam."


def get_contest_classroom(contest: Contest):
    """The classroom whose membership defines who may take this contest."""
    binding = (
        contest.classroom_bindings.select_related("classroom")
        .order_by("bound_at")
        .first()
    )
    return binding.classroom if binding is not None else None


def is_contest_candidate(user, contest: Contest) -> bool:
    """True when ``user`` has any role in the contest's classroom."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    classroom = get_contest_classroom(contest)
    if classroom is None:
        return False
    return get_user_role_in_classroom(user, classroom) is not None


def ensure_candidate_participant(contest: Contest, user) -> ContestParticipant:
    """Return the user's attempt record, creating it on their first exam action.

    Eligibility is re-checked even when a row already exists: someone removed
    from the classroom keeps their history but cannot start or resume.
    """
    if not is_contest_candidate(user, contest):
        raise PermissionDenied(NOT_A_CANDIDATE_MESSAGE)
    participant, _created = ContestParticipant.objects.get_or_create(
        contest=contest,
        user=user,
    )
    return participant


def _classroom_staff_ids(classroom) -> set[int]:
    staff = set(classroom.admins.values_list("id", flat=True)) | {classroom.owner_id}
    staff |= set(
        classroom.memberships.filter(role="ta").values_list("user_id", flat=True)
    )
    return staff


def student_member_ids(contest: Contest) -> list[int]:
    """User ids of the contest classroom's student members.

    Staff may take the contest too, but they are not expected to, so only
    students are listed before they act. Must agree with
    ``get_user_role_in_classroom(...) == "member"`` for every user;
    ``test_participation`` pins the two together.
    """
    classroom = get_contest_classroom(contest)
    if classroom is None:
        return []
    return list(
        classroom.memberships.exclude(user_id__in=_classroom_staff_ids(classroom))
        .exclude(user__is_staff=True)
        .exclude(user__is_superuser=True)
        .values_list("user_id", flat=True)
    )


def attempted_participants(contest: Contest) -> QuerySet[ContestParticipant]:
    """Attempt records of everyone who actually sat this contest.

    The single source for standings, scoring, result exports and the question
    edit lock. No role filtering: a staff test run counts like any other
    attempt until it is reset. A row that only checked in, or was reset back
    to not started, has not sat the exam and is left out.
    """
    return contest.registrations.filter(
        Q(started_at__isnull=False) | ~Q(exam_status=ExamStatus.NOT_STARTED)
    )


def roster_user_ids(contest: Contest) -> list[int]:
    """Everyone a teacher should see on this contest's roster.

    Current student members -- with or without an attempt record -- plus
    anyone who actually sat it, staff included. Listing staff attempts is what
    lets a teacher find and reset their own test run; listing past attempts
    keeps a result visible after its owner leaves the classroom.
    """
    attempted = set(
        attempted_participants(contest).values_list("user_id", flat=True)
    )
    return sorted(set(student_member_ids(contest)) | attempted)
