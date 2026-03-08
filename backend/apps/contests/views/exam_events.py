"""ExamEventsMixin — event logging and penalty processing."""
import logging

from django.utils import timezone
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamStatus,
)
from ..serializers import (
    ExamEventSerializer,
    ExamEventCreateSerializer,
)
from ..permissions import can_manage_contest
from ..services.anti_cheat_session import is_duplicate_exam_event
from ..services.exam_submission import finalize_submission
from ..services.exam_validation import validate_exam_operation
from .activity import ContestActivityViewSet
from apps.core.throttles import ExamEventsThrottle

logger = logging.getLogger(__name__)


class ExamEventsMixin:
    """Mixin for exam event logging and penalty logic."""

    def _build_event_response(self, participant, contest):
        auto_unlock_at = None
        if participant.exam_status == ExamStatus.LOCKED and participant.locked_at and contest.allow_auto_unlock:
            minutes = contest.auto_unlock_minutes or 0
            auto_unlock_at = participant.locked_at + timezone.timedelta(minutes=minutes)

        return {
            'exam_status': participant.exam_status,
            'violation_count': participant.violation_count,
            'max_cheat_warnings': contest.max_cheat_warnings,
            'locked': participant.exam_status in {ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER},
            'submit_reason': participant.submit_reason or "",
            'auto_unlock_at': auto_unlock_at,
        }

    def _auto_submit_participant(
        self,
        participant,
        contest,
        actor,
        reason,
        upload_session_id: str | None = None,
    ):
        finalize_submission(
            participant,
            submit_reason=reason,
            upload_session_id=upload_session_id,
            activity_user=actor,
            activity_action_type="auto_submit",
            activity_details=reason,
        )

    def _process_penalized_event(
        self,
        participant,
        contest,
        actor,
        event_type,
        upload_session_id: str | None = None,
    ):
        """
        Unified anti-cheat state handling.
        - in_progress: threshold => lock
        - paused/locked: threshold => auto-submit
        - submitted: no-op (already finished)
        """
        if participant.exam_status == ExamStatus.SUBMITTED:
            return participant

        participant.violation_count += 1
        update_fields = ['violation_count']
        force_lock = event_type in self.IMMEDIATE_LOCK_EVENT_TYPES
        reached_threshold = participant.violation_count >= contest.max_cheat_warnings
        should_escalate = force_lock or reached_threshold

        if should_escalate:
            if participant.exam_status == ExamStatus.IN_PROGRESS:
                participant.exam_status = ExamStatus.LOCKED
                participant.locked_at = timezone.now()
                if force_lock:
                    if event_type == "warning_timeout":
                        participant.lock_reason = "Warning timeout: student did not acknowledge warning within 30 seconds"
                    elif event_type == "screen_share_stopped":
                        participant.lock_reason = "Screen share stopped during exam session"
                    else:
                        participant.lock_reason = f"System lock (immediate): {event_type}"
                else:
                    participant.lock_reason = f"System lock: {event_type}"
                update_fields.extend(['exam_status', 'locked_at', 'lock_reason'])
                participant.save(update_fields=update_fields)
                ContestActivityViewSet.log_activity(
                    contest,
                    actor,
                    'lock_user',
                    f"Auto-locked due to {event_type}"
                )
                return participant

            # paused/locked are non-answering states; escalate to immediate submission.
            reason = (
                f"Auto-submitted: violation while {participant.exam_status} "
                f"(event={event_type}, count={participant.violation_count}/{contest.max_cheat_warnings})"
            )
            participant.save(update_fields=update_fields)
            self._auto_submit_participant(
                participant,
                contest,
                actor,
                reason,
                upload_session_id=upload_session_id,
            )
            return ContestParticipant.objects.get(pk=participant.pk)

        participant.save(update_fields=update_fields)
        return participant

    @action(detail=False, methods=['post', 'get'], url_path='events',
            permission_classes=[permissions.IsAuthenticated],
            throttle_classes=[ExamEventsThrottle])
    def events(self, request, contest_pk=None):
        """
        Handle exam events.
        POST: Log an event (Student/Participant)
        GET: List events (Teacher/Admin only)
        """
        if request.method == 'POST':
            return self._log_event(request, contest_pk)
        else:
            return self._list_events(request, contest_pk)

    def _log_event(self, request, contest_pk=None):
        """
        Log an exam event (tab switch, etc).
        Logs monitored events for in_progress / paused / locked participants.
        """
        contest = get_object_or_404(Contest, id=contest_pk)

        # 3-layer permission check (status validated below)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False, allow_admin_bypass=False
        )
        if error_response:
            return error_response

        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        if participant.exam_status in self.MONITORED_STATUSES:
            conflict_response = self._ensure_active_device_session(contest, participant, request)
            if conflict_response:
                return conflict_response

        serializer = ExamEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        event_type = serializer.validated_data['event_type']
        raw_metadata = serializer.validated_data.get('metadata')
        metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
        upload_session_id = str(metadata.get("upload_session_id") or "").strip() or None
        event_phase = str(metadata.get("phase") or "").upper()
        idempotency_token = str(metadata.get("event_idempotency_key") or "").strip()

        if is_duplicate_exam_event(
            contest_id=contest.id,
            user_id=request.user.id,
            event_type=event_type,
            token=idempotency_token or None,
        ):
            logger.info(
                "anticheat_event_decision contest=%s user=%s event=%s decision=dedupe_hit phase=%s",
                contest.id,
                request.user.id,
                event_type,
                event_phase or "unknown",
            )
            payload = self._build_event_response(participant, contest)
            payload.update(
                {
                    'max_cheat_warnings': contest.max_cheat_warnings,
                    'decision': 'dedupe_hit',
                    'dedupe_hit': True,
                }
            )
            return Response(payload)

        if participant.exam_status == ExamStatus.SUBMITTED:
            ExamEvent.objects.create(
                contest=contest,
                user=request.user,
                event_type=event_type,
                metadata=metadata,
            )
            logger.info(
                "anticheat_event_decision contest=%s user=%s event=%s decision=terminal_guard status=submitted",
                contest.id,
                request.user.id,
                event_type,
            )
            payload = self._build_event_response(participant, contest)
            payload.update(
                {
                    'max_cheat_warnings': contest.max_cheat_warnings,
                    'decision': 'terminal_guard',
                    'dedupe_hit': False,
                }
            )
            return Response(payload)

        if participant.exam_status not in self.MONITORED_STATUSES:
            return Response(
                {'error': f'Exam event is not accepted in current state: {participant.exam_status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        terminal_phase_guard = (
            event_phase in {"TERMINATING", "TERMINAL"}
            and event_type in self.PENALIZED_EVENT_TYPES
        )

        if event_type in self.PENALIZED_EVENT_TYPES and not terminal_phase_guard:
            with transaction.atomic():
                ExamEvent.objects.create(
                    contest=contest,
                    user=request.user,
                    event_type=event_type,
                    metadata=metadata
                )
                participant = ContestParticipant.objects.select_for_update().get(pk=participant.pk)
                participant = self._process_penalized_event(
                    participant=participant,
                    contest=contest,
                    actor=request.user,
                    event_type=event_type,
                    upload_session_id=upload_session_id,
                )
        else:
            ExamEvent.objects.create(
                contest=contest,
                user=request.user,
                event_type=event_type,
                metadata=metadata
            )

        payload = self._build_event_response(participant, contest)
        logger.info(
            "anticheat_event_decision contest=%s user=%s event=%s decision=%s phase=%s",
            contest.id,
            request.user.id,
            event_type,
            'terminal_guard' if terminal_phase_guard else 'accepted',
            event_phase or "unknown",
        )
        payload.update(
            {
                'max_cheat_warnings': contest.max_cheat_warnings,
                'decision': 'terminal_guard' if terminal_phase_guard else 'accepted',
                'dedupe_hit': False,
            }
        )
        return Response(payload)

    def _list_events(self, request, contest_pk=None):
        """
        List all events for this contest (Teacher only).
        """
        contest = get_object_or_404(Contest, id=contest_pk)
        user = request.user

        if not can_manage_contest(user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )

        events = ExamEvent.objects.filter(contest_id=contest_pk).select_related('user').order_by('-created_at')
        return Response(ExamEventSerializer(events, many=True).data)
