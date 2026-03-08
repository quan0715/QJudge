"""
Shared exam operation validation helper.
Extracted from views.py to be used by multiple ExamViewSet mixins.
"""
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from ..models import ContestParticipant, ExamStatus
from ..permissions import can_manage_contest


def validate_exam_operation(contest, user, require_in_progress=False, allow_admin_bypass=True):
    """
    3-layer permission check for exam operations.

    Layer 1: Contest status (must be published)
    Layer 2: Time range (must be within start_time ~ end_time)
    Layer 3: Participant status (must be registered, optionally in_progress)

    Returns: (participant, error_response) tuple
             If validation passes: (participant, None)
             If validation fails: (None, Response)
    """
    # Manager bypass for Layer 1 and 2 (platform_admin / owner / co_owner)
    if allow_admin_bypass and can_manage_contest(user, contest):
        try:
            participant = ContestParticipant.objects.get(contest=contest, user=user)
            return participant, None
        except ContestParticipant.DoesNotExist:
            # Managers don't need to be registered
            return None, None

    # Layer 1: Contest status
    if contest.status != 'published':
        return None, Response(
            {'error': 'Contest is not published.'},
            status=status.HTTP_403_FORBIDDEN
        )

    # Layer 2: Time range
    now = timezone.now()
    if contest.start_time and now < contest.start_time:
        return None, Response(
            {'error': 'Contest has not started yet. Please wait until the start time.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if contest.end_time and now > contest.end_time:
        return None, Response(
            {'error': 'Contest has ended.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Layer 3: Participant status
    try:
        participant = ContestParticipant.objects.get(contest=contest, user=user)
    except ContestParticipant.DoesNotExist:
        return None, Response(
            {'error': 'Not registered for this contest.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if require_in_progress and participant.exam_status != ExamStatus.IN_PROGRESS:
        return None, Response(
            {'error': 'Exam is not in progress.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    return participant, None
