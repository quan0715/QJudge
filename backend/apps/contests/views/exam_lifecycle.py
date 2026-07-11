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
from ..constants import (
    IMMEDIATE_LOCK_EVENT_TYPES as IMMEDIATE_LOCK_EVENT_TYPES_CONST,
    PENALIZED_EVENT_TYPES as PENALIZED_EVENT_TYPES_CONST,
)
from ..permissions import can_manage_contest
from ..services.anti_cheat_session import (
    blacklist_other_tokens,
    build_device_conflict_payload,
    clear_exam_allowed_jti,
    get_device_id,
    get_refresh_jti,
    get_token_jti,
    set_active_session,
    touch_heartbeat,
    clear_heartbeat,
)
from ..models import ExamEvent as _ExamEvent  # noqa: used in lifecycle
from ..services.exam_submission import finalize_submission
from ..services.attendance import (
    assert_attendance_allows_start,
    build_attendance_error_payload,
    normalize_attendance_error_code,
)
from ..services.activity_log import log_contest_activity
from .exam_events import ExamEventsMixin
from .exam_anticheat import ExamAnticheatMixin
from .exam_evidence import ExamEvidenceMixin
from .exam_sfu import ExamSfuMixin
from .exam_validation_response import validate_exam_operation_for_view


class ExamLifecycleMixin:
    """Mixin for exam start/end lifecycle."""

    @action(detail=False, methods=['post'], url_path='start')
    def start_exam(self, request, contest_pk=None):
        """
        Signal that user is starting the exam (entering full screen).
        """
        contest = get_object_or_404(Contest, id=contest_pk)

        # 3-layer permission check (don't require in_progress for start)
        participant, error_response = validate_exam_operation_for_view(
            contest, request.user, require_in_progress=False
        )
        if error_response is not None:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if locked
        if participant.exam_status == ExamStatus.LOCKED:
            return Response(
                {'error': 'You have been locked out of this contest.'},
                status=status.HTTP_403_FORBIDDEN
            )

        conflict_response = self._ensure_active_device_session(contest, participant, request)
        if conflict_response:
            return conflict_response

        try:
            assert_attendance_allows_start(contest, participant)
        except ValueError as exc:
            return Response(
                build_attendance_error_payload(normalize_attendance_error_code(exc)),
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if already submitted
        if participant.exam_status == ExamStatus.SUBMITTED:
            if contest.allow_multiple_joins:
                # Re-entry keeps historical violations as the backend source of truth.
                participant.exam_status = ExamStatus.IN_PROGRESS
                participant.save(update_fields=["exam_status"])
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
            log_contest_activity(
                contest,
                request.user,
                'resume_exam',
                "Resumed exam"
            )
            touch_heartbeat(contest.id, request.user.id)
            return Response({'status': 'resumed', 'exam_status': ExamStatus.IN_PROGRESS})

        # Start exam for user if not already started
        if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
            participant.started_at = timezone.now()
            participant.exam_status = ExamStatus.IN_PROGRESS
            participant.save()

            # Log activity
            log_contest_activity(
                contest,
                request.user,
                'start_exam',
                "Started exam"
            )

        set_active_session(contest, participant, request, get_device_id(request))

        # Part A: blacklist other devices' JWT tokens
        if getattr(contest, "cheat_detection_enabled", False):
            jti = get_token_jti(request)
            if jti:
                bl_count = blacklist_other_tokens(
                    request.user,
                    contest_id=contest.id,
                    access_jti=jti,
                    refresh_jti=get_refresh_jti(request),
                )
                if bl_count:
                    _ExamEvent.objects.create(
                        contest=contest,
                        user=request.user,
                        event_type="other_devices_logged_out",
                        metadata={"blacklisted_count": bl_count},
                    )

        touch_heartbeat(contest.id, request.user.id)
        return Response({'status': 'started', 'exam_status': ExamStatus.IN_PROGRESS})

    @action(detail=False, methods=['post'], url_path='end')
    def end_exam(self, request, contest_pk=None):
        """
        User manually finishes the exam.
        Allowed in: in_progress, locked, paused states.
        """
        contest = get_object_or_404(Contest, id=contest_pk)

        # Don't require in_progress - allow submission from in_progress, locked, or paused
        participant, error_response = validate_exam_operation_for_view(
            contest, request.user, require_in_progress=False
        )
        if error_response is not None:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)

        if participant.exam_status == ExamStatus.SUBMITTED:
            return Response({
                'status': 'finished',
                'exam_status': ExamStatus.SUBMITTED,
                'submit_reason': participant.submit_reason,
                'violation_count': participant.violation_count,
                'already_submitted': True,
            })

        submittable_states = [
            ExamStatus.IN_PROGRESS,
            ExamStatus.LOCKED,
            ExamStatus.PAUSED,
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

        # Soft device check — log event but do NOT block submission
        conflict_payload = build_device_conflict_payload(contest, participant, request)
        if conflict_payload is not None:
            _ExamEvent.objects.create(
                contest=contest,
                user=request.user,
                event_type="end_exam_device_mismatch",
                metadata={
                    "device_id": get_device_id(request),
                    "source": "end_exam_soft_check",
                },
            )

        submit_reason = str(request.data.get('submit_reason') or "Submitted exam").strip()
        finalize_submission(
            participant,
            submit_reason=submit_reason,
            upload_session_id=str(request.data.get("upload_session_id") or ""),
            source_module=str(request.data.get("source_module") or ""),
            activity_user=request.user,
            activity_action_type="end_exam",
            activity_details=submit_reason,
        )
        clear_heartbeat(contest.id, request.user.id)

        # Release JTI pin so other devices can work normally again
        if getattr(contest, "cheat_detection_enabled", False):
            clear_exam_allowed_jti(request.user.id, contest_id=contest.id)

        return Response({
            'status': 'finished',
            'exam_status': ExamStatus.SUBMITTED,
            'submit_reason': submit_reason,
            'violation_count': participant.violation_count,
            'already_submitted': False,
        })


class ExamViewSet(
    ExamLifecycleMixin,
    ExamEventsMixin,
    ExamAnticheatMixin,
    ExamEvidenceMixin,
    ExamSfuMixin,
    viewsets.GenericViewSet,
):
    """Composed ExamViewSet — all actions preserved, URL unchanged."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExamEventCreateSerializer
    PENALIZED_EVENT_TYPES = PENALIZED_EVENT_TYPES_CONST
    IMMEDIATE_LOCK_EVENT_TYPES = IMMEDIATE_LOCK_EVENT_TYPES_CONST
    MONITORED_STATUSES = {ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED}
