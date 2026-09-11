"""Who may take a contest, and when their attempt record comes into existence.

Eligibility is classroom membership, nothing else: a student member of the
contest's bound classroom may take it. There is no registration step and no
roster sync. The ``ContestParticipant`` row is an *attempt record* (status,
start time, integrity attempt, score) and is created by the first real exam
action -- self check-in or starting the exam -- through
``ensure_candidate_participant``.

A contest without a classroom binding has no candidates. The API has no path
that creates one (``ContestViewSet.create`` refuses), so this only ever
applies to legacy or fixture data.
"""

from __future__ import annotations

from rest_framework.exceptions import PermissionDenied

from apps.classrooms.permissions import get_user_role_in_classroom

from ..models import Contest, ContestParticipant

NOT_A_CANDIDATE_MESSAGE = "Only student members of this contest's classroom can take it."
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
    """True when ``user`` is a student member of the contest's classroom.

    Owners, co-admins, TAs and platform admins are staff, not candidates --
    they review the paper through the exam preview instead of sitting it.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    classroom = get_contest_classroom(contest)
    if classroom is None:
        return False
    return get_user_role_in_classroom(user, classroom) == "member"


def ensure_candidate_participant(contest: Contest, user) -> ContestParticipant:
    """Return the user's attempt record, creating it on their first exam action.

    Eligibility is re-checked even when a row already exists: a student removed
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


def candidate_user_ids(contest: Contest) -> list[int]:
    """User ids of every student member of the contest's classroom.

    Bulk form of ``is_contest_candidate`` for roster queries. It must reach the
    same verdict as ``get_user_role_in_classroom(...) == "member"`` for every
    user; ``test_participation`` pins the two together.
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


def roster_user_ids(contest: Contest) -> list[int]:
    """Everyone a teacher should see on this contest's roster.

    Current student members -- with or without an attempt record -- plus
    anyone who actually sat it. The second half keeps a student's result
    visible after they leave the classroom. Staff attempts (a teacher trying
    their own paper) are left out so they never read as a student's.
    """
    candidates = set(candidate_user_ids(contest))
    classroom = get_contest_classroom(contest)
    staff = _classroom_staff_ids(classroom) if classroom is not None else set()
    attempted = set(
        contest.registrations.filter(started_at__isnull=False)
        .exclude(user_id__in=staff)
        .values_list("user_id", flat=True)
    )
    return sorted(candidates | attempted)
