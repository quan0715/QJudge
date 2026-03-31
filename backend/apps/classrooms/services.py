"""
Business logic for classrooms.
"""
import secrets
import string

from .models import Classroom


def generate_invite_code():
    """Generate a unique 8-character invite code."""
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        code = ''.join(secrets.choice(alphabet) for _ in range(8))
        if not Classroom.objects.filter(invite_code=code).exists():
            return code
    raise RuntimeError('Failed to generate unique invite code after 10 attempts')


def sync_classroom_participants(classroom, contest):
    """
    When a contest is bound to a classroom, bulk-register all classroom
    members as ContestParticipant.
    """
    from apps.contests.models import AssignmentState, ContestParticipant

    admin_user_ids = set(classroom.admins.values_list('id', flat=True))
    excluded_user_ids = admin_user_ids | {classroom.owner_id}
    member_user_ids = [
        user_id
        for user_id in classroom.memberships.values_list('user_id', flat=True)
        if user_id not in excluded_user_ids
    ]
    existing = set(
        ContestParticipant.objects.filter(
            contest=contest, user_id__in=member_user_ids
        ).values_list('user_id', flat=True)
    )
    new_participants = [
        ContestParticipant(
            contest=contest,
            user_id=uid,
            assignment_state=(
                AssignmentState.UNACCEPTED
                if contest.delivery_mode == 'practice'
                else AssignmentState.ACCEPTED
            ),
        )
        for uid in member_user_ids
        if uid not in existing
    ]
    if new_participants:
        ContestParticipant.objects.bulk_create(new_participants, ignore_conflicts=True)
    return len(new_participants)


def on_member_joined(classroom, user):
    """
    When a new member joins a classroom, auto-register them for all
    bound published contests.
    """
    from apps.contests.models import AssignmentState, ContestParticipant

    if user.id == classroom.owner_id or classroom.admins.filter(pk=user.pk).exists():
        return 0

    bound_contests = classroom.classroom_contests.select_related('contest').filter(
        contest__status='published'
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
                    assignment_state=(
                        AssignmentState.UNACCEPTED
                        if binding.contest.delivery_mode == 'practice'
                        else AssignmentState.ACCEPTED
                    ),
                )
            )
    if new_participants:
        ContestParticipant.objects.bulk_create(new_participants, ignore_conflicts=True)
    return len(new_participants)
