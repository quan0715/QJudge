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
from ..services.anti_cheat_session import (
    get_device_id,
    is_duplicate_exam_event,
    touch_heartbeat,
)
from ..services.exam_submission import finalize_submission, normalize_source_module
from ..services.exam_validation import validate_exam_operation
from .activity import ContestActivityViewSet
from apps.core.throttles import ExamEventsThrottle

logger = logging.getLogger(__name__)


class ExamEventsMixin:
    """Mixin for exam event logging and penalty logic."""

    MODULE_ROLE_PRIMARY = "primary"
    MODULE_ROLE_SECONDARY = "secondary"
    WEBCAM_STOPPED_EVENT = "webcam_stopped"
    VIEWPORT_STOPPED_EVENT = "viewport_stopped"

    def _infer_entry_device_kind(self, metadata: dict, user_agent: str) -> str:
        explicit_kind = str(metadata.get("device_kind") or "").strip().lower()
        if explicit_kind in {"desktop", "tablet"}:
            return explicit_kind

        is_tablet_meta = metadata.get("is_tablet")
        if isinstance(is_tablet_meta, bool):
            return "tablet" if is_tablet_meta else "desktop"

        ua = user_agent.lower()
        is_ipad = "ipad" in ua or ("macintosh" in ua and "mobile" in ua)
        is_android_tablet = "android" in ua and "mobile" not in ua
        return "tablet" if (is_ipad or is_android_tablet) else "desktop"

    def _enrich_exam_entered_metadata(self, request, metadata: dict) -> dict:
        user_agent = str(request.META.get("HTTP_USER_AGENT") or "")[:512]
        device_id = get_device_id(request)
        enriched = dict(metadata)
        enriched.setdefault("device_id", device_id)
        enriched.setdefault("user_agent", user_agent)
        enriched["device_kind"] = self._infer_entry_device_kind(enriched, user_agent)
        return enriched

    def _resolve_module_context(self, contest, event_type: str, metadata: dict) -> tuple[str, str]:
        module = normalize_source_module(metadata.get("module"))
        if event_type.startswith("webcam_"):
            module = "webcam"
        elif event_type.startswith("screen_share_"):
            module = "screen_share"

        module_role_raw = str(metadata.get("module_role") or "").strip().lower()
        if module_role_raw in {self.MODULE_ROLE_PRIMARY, self.MODULE_ROLE_SECONDARY}:
            return module, module_role_raw

        if event_type == self.WEBCAM_STOPPED_EVENT:
            policy = contest.anticheat_device_policy if isinstance(contest.anticheat_device_policy, dict) else {}
            desktop_policy = policy.get("desktop") if isinstance(policy.get("desktop"), dict) else {}
            desktop_sources = (
                desktop_policy.get("sources")
                if isinstance(desktop_policy.get("sources"), dict)
                else {}
            )
            screen_share_policy = (
                desktop_sources.get("screen_share")
                if isinstance(desktop_sources.get("screen_share"), dict)
                else {}
            )
            webcam_policy = (
                desktop_sources.get("webcam")
                if isinstance(desktop_sources.get("webcam"), dict)
                else {}
            )
            screen_enabled = bool(screen_share_policy.get("enabled"))
            webcam_enabled = bool(webcam_policy.get("enabled"))
            if webcam_enabled and not screen_enabled:
                return module, self.MODULE_ROLE_PRIMARY
            return module, self.MODULE_ROLE_SECONDARY

        if event_type == "screen_share_stopped":
            return module, self.MODULE_ROLE_PRIMARY

        return module, self.MODULE_ROLE_SECONDARY

    def _is_immediate_lock_event(self, event_type: str, module_role: str) -> bool:
        if event_type in {self.WEBCAM_STOPPED_EVENT, self.VIEWPORT_STOPPED_EVENT}:
            return module_role == self.MODULE_ROLE_PRIMARY
        return event_type in self.IMMEDIATE_LOCK_EVENT_TYPES

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
        source_module: str | None = None,
    ):
        finalize_submission(
            participant,
            submit_reason=reason,
            upload_session_id=upload_session_id,
            source_module=source_module,
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
        source_module: str | None = None,
        module_role: str | None = None,
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
        normalized_role = (
            module_role
            if module_role in {self.MODULE_ROLE_PRIMARY, self.MODULE_ROLE_SECONDARY}
            else self.MODULE_ROLE_SECONDARY
        )
        force_lock = self._is_immediate_lock_event(event_type, normalized_role)
        reached_threshold = participant.violation_count >= contest.max_cheat_warnings
        should_escalate = force_lock or reached_threshold

        if should_escalate:
            if participant.exam_status == ExamStatus.IN_PROGRESS:
                participant.exam_status = ExamStatus.LOCKED
                participant.locked_at = timezone.now()
                if force_lock:
                    if event_type == "warning_timeout":
                        timeout = getattr(contest, "warning_timeout_seconds", 30)
                        participant.lock_reason = f"Warning timeout: student did not acknowledge warning within {timeout} seconds"
                    elif event_type == "screen_share_stopped":
                        participant.lock_reason = "Screen share stopped during exam session"
                    elif event_type == self.WEBCAM_STOPPED_EVENT:
                        participant.lock_reason = "Webcam stopped during exam session"
                    elif event_type == self.VIEWPORT_STOPPED_EVENT:
                        participant.lock_reason = "Viewport integrity lost during exam session"
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
                source_module=source_module,
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

        # Update heartbeat on every event received
        touch_heartbeat(contest.id, request.user.id)

        event_type = serializer.validated_data['event_type']
        raw_metadata = serializer.validated_data.get('metadata')
        metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
        if event_type == "exam_entered":
            metadata = self._enrich_exam_entered_metadata(request, metadata)
        source_module, module_role = self._resolve_module_context(contest, event_type, metadata)
        metadata.setdefault("module", source_module)
        metadata.setdefault("module_role", module_role)
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
                    source_module=source_module,
                    module_role=module_role,
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
