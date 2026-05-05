"""
Shared exam operation validation helper.
Extracted from views.py to be used by multiple ExamViewSet mixins.
"""
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from ..models import ContestParticipant, ExamStatus
from ..permissions import can_manage_contest


def validate_exam_operation(contest, user, require_in_progress=False, allow_admin_bypass=True):
    """
    3-layer permission check for exam operations.

    Layer 1: Contest status (must be published)
    Layer 2: Time range (must be within start_time ~ end_time)
    Layer 3: Participant status (must be registered, optionally in_progress)

    Returns the participant when validation passes, or ``None`` for managers
    using the admin bypass without a participant row.

    Raises DRF exceptions instead of constructing Response objects; views own
    HTTP response serialization.
    """
    # Manager bypass for Layer 1 and 2 (platform_admin / owner / co_owner)
    if allow_admin_bypass and can_manage_contest(user, contest):
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
            return participant
        except ContestParticipant.DoesNotExist:
            # Managers don't need to be registered
            return None

    # Layer 1: Contest status
    if contest.status != 'published':
        raise PermissionDenied('Contest is not published.')

    # Layer 2: Time range
    now = timezone.now()
    if contest.start_time and now < contest.start_time:
        raise ValidationError('Contest has not started yet. Please wait until the start time.')
    if contest.end_time and now > contest.end_time:
        raise ValidationError('Contest has ended.')

    # Layer 3: Participant status
    try:
        participant = ContestParticipant.objects.get(contest=contest, user=user)
    except ContestParticipant.DoesNotExist:
        raise ValidationError('Not registered for this contest.')

    if require_in_progress and participant.exam_status != ExamStatus.IN_PROGRESS:
        raise ValidationError('Exam is not in progress.')

    return participant
