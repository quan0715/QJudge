"""ExamLifecycleMixin + composed ExamViewSet."""
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ContestParticipant,
    ExamStatus,
)
from ..serializers import ExamEventCreateSerializer
from ..permissions import can_manage_contest
from ..services.anti_cheat_session import get_device_id, set_active_session
from ..services.exam_submission import finalize_submission
from ..services.exam_validation import validate_exam_operation
from .activity import ContestActivityViewSet
from .exam_events import ExamEventsMixin
from .exam_anticheat import ExamAnticheatMixin
from .exam_evidence import ExamEvidenceMixin


class ExamLifecycleMixin:
    """Mixin for exam start/end lifecycle."""

    @action(detail=False, methods=['post'], url_path='start')
    def start_exam(self, request, contest_pk=None):
        """
        Signal that user is starting the exam (entering full screen).
        """
        contest = get_object_or_404(Contest, id=contest_pk)

        # 3-layer permission check (don't require in_progress for start)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if locked
        if participant.exam_status in {ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER}:
            message = (
                'Exam session has been locked due to device takeover. '
                'Please wait for invigilator approval.'
                if participant.exam_status == ExamStatus.LOCKED_TAKEOVER
                else 'You have been locked out of this contest.'
            )
            return Response(
                {'error': message},
                status=status.HTTP_403_FORBIDDEN
            )

        conflict_response = self._ensure_active_device_session(contest, participant, request)
        if conflict_response:
            return conflict_response

        # Check if already submitted
        if participant.exam_status == ExamStatus.SUBMITTED:
            if contest.allow_multiple_joins:
                # Reset for re-entry - clear violation count for fresh start
                participant.exam_status = ExamStatus.IN_PROGRESS
                participant.violation_count = 0
                participant.save()
            else:
                return Response(
                    {'error': 'You have already finished this exam.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Handle resume from paused state
        if participant.exam_status == ExamStatus.PAUSED:
            participant.exam_status = ExamStatus.IN_PROGRESS
            participant.save()

            # Log activity
            ContestActivityViewSet.log_activity(
                contest,
                request.user,
                'resume_exam',
                "Resumed exam"
            )
            return Response({'status': 'resumed', 'exam_status': ExamStatus.IN_PROGRESS})

        # Start exam for user if not already started
        if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
            participant.started_at = timezone.now()
            participant.exam_status = ExamStatus.IN_PROGRESS
            participant.save()

            # Log activity
            ContestActivityViewSet.log_activity(
                contest,
                request.user,
                'start_exam',
                "Started exam"
            )

        set_active_session(contest, participant, request, get_device_id(request))
        return Response({'status': 'started', 'exam_status': ExamStatus.IN_PROGRESS})

    @action(detail=False, methods=['post'], url_path='end')
    def end_exam(self, request, contest_pk=None):
        """
        User manually finishes the exam.
        Allowed in: in_progress, locked, paused states.
        """
        contest = get_object_or_404(Contest, id=contest_pk)

        # Don't require in_progress - allow submission from in_progress, locked, or paused
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)

        if participant.exam_status == ExamStatus.SUBMITTED:
            return Response({
                'status': 'finished',
                'exam_status': ExamStatus.SUBMITTED,
                'submit_reason': participant.submit_reason,
                'already_submitted': True,
            })

        # Check if exam can be submitted (must be in_progress, locked, paused, or takeover-locked)
        submittable_states = [
            ExamStatus.IN_PROGRESS,
            ExamStatus.LOCKED,
            ExamStatus.PAUSED,
            ExamStatus.LOCKED_TAKEOVER,
        ]
        if participant.exam_status not in submittable_states:
            return Response(
                {'error': f'Cannot submit exam in current state: {participant.exam_status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not participant.started_at:
            return Response(
                {'error': 'You have not started the exam yet'},
                status=status.HTTP_400_BAD_REQUEST
            )

        submit_reason = str(request.data.get('submit_reason') or "Submitted exam").strip()
        finalize_submission(
            participant,
            submit_reason=submit_reason,
            upload_session_id=str(request.data.get("upload_session_id") or ""),
            activity_user=request.user,
            activity_action_type="end_exam",
            activity_details=submit_reason,
        )

        return Response({
            'status': 'finished',
            'exam_status': ExamStatus.SUBMITTED,
            'submit_reason': submit_reason,
        })


class ExamViewSet(
    ExamLifecycleMixin,
    ExamEventsMixin,
    ExamAnticheatMixin,
    ExamEvidenceMixin,
    viewsets.GenericViewSet,
):
    """Composed ExamViewSet — all actions preserved, URL unchanged."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExamEventCreateSerializer
    PENALIZED_EVENT_TYPES = {
        'tab_hidden',
        'window_blur',
        'exit_fullscreen',
        'multiple_displays',
        'mouse_leave',
        'screen_share_stopped',
        'warning_timeout',
        'forbidden_focus_event',
    }
    IMMEDIATE_LOCK_EVENT_TYPES = {'warning_timeout', 'screen_share_stopped'}
    MONITORED_STATUSES = {ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER}
