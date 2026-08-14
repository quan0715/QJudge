"""ExamLifecycleMixin + composed ExamViewSet."""
from django.utils import timezone
from django.db import transaction
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ContestParticipant,
    ExamStatus,
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
)
from ..services.integrity_presence import clear_checkpoint
from ..services.exam_submission import finalize_submission
from ..services.attendance import (
    AttendanceValidationError,
    assert_attendance_allows_start,
    build_attendance_error_payload,
)
from ..services.activity_log import log_contest_activity
from .exam_events import ExamEventsMixin
from .exam_anticheat import ExamAnticheatMixin
from .exam_evidence import ExamEvidenceMixin
from .exam_integrity import ExamIntegrityMixin
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
        except AttendanceValidationError as exc:
            return Response(
                build_attendance_error_payload(exc.code),
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            contest = Contest.objects.select_for_update().get(pk=contest.pk)
            participant = ContestParticipant.objects.select_for_update().get(
                pk=participant.pk,
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
                participant.save(update_fields=["exam_status"])
                # Log activity
                log_contest_activity(
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
                participant.save(update_fields=["started_at", "exam_status"])

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
                    log_contest_activity(
                        contest,
                        request.user,
                        "other_devices_logged_out",
                        f"Logged out {bl_count} other device session(s)",
                    )

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

        # Submission remains non-blocking. The shared device guard records any
        # mismatch as an activity audit, not as an anti-cheat timeline event.
        build_device_conflict_payload(contest, participant, request)

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
        clear_checkpoint(contest.id, request.user.id)

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
    ExamIntegrityMixin,
    viewsets.GenericViewSet,
):
    """Composed ExamViewSet — all actions preserved, URL unchanged."""
    permission_classes = [permissions.IsAuthenticated]
    MONITORED_STATUSES = {ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED}
