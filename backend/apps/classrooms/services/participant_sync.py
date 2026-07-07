"""Synchronization between classroom membership and contest participants."""

from apps.classrooms.models import Classroom


def _assignment_state_for_contest(contest):
    from apps.contests.models import AssignmentState

    return (
        AssignmentState.UNACCEPTED
        if contest.delivery_mode == "practice"
        else AssignmentState.ACCEPTED
    )


def sync_classroom_participants(classroom: Classroom, contest) -> int:
    """
    When a contest is bound to a classroom, bulk-register classroom members.
    """
    from apps.contests.models import ContestParticipant

    admin_user_ids = set(classroom.admins.values_list("id", flat=True))
    excluded_user_ids = admin_user_ids | {classroom.owner_id}
    member_user_ids = [
        user_id
        for user_id in classroom.memberships.values_list("user_id", flat=True)
        if user_id not in excluded_user_ids
    ]
    existing = set(
        ContestParticipant.objects.filter(
            contest=contest, user_id__in=member_user_ids
        ).values_list("user_id", flat=True)
    )
    new_participants = [
        ContestParticipant(
            contest=contest,
            user_id=uid,
            assignment_state=_assignment_state_for_contest(contest),
        )
        for uid in member_user_ids
        if uid not in existing
    ]
    if new_participants:
        ContestParticipant.objects.bulk_create(
            new_participants,
            ignore_conflicts=True,
        )
    return len(new_participants)


def on_member_joined(classroom: Classroom, user) -> int:
    """
    When a member joins a classroom, auto-register them for published contests.
    """
    from apps.contests.models import ContestParticipant

    if (
        user.id == classroom.owner_id
        or classroom.admins.filter(pk=user.pk).exists()
    ):
        return 0

    bound_contests = classroom.classroom_contests.select_related("contest").filter(
        contest__status="published"
    )
    new_participants = []
    for binding in bound_contests:
        if not ContestParticipant.objects.filter(
            contest=binding.contest, user=user
        ).exists():
            new_participants.append(
                ContestParticipant(
                    contest=binding.contest,
                    user=user,
                    assignment_state=_assignment_state_for_contest(binding.contest),
                )
            )
    if new_participants:
        ContestParticipant.objects.bulk_create(
            new_participants,
            ignore_conflicts=True,
        )
    return len(new_participants)
