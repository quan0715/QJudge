"""ExamEventsMixin — event logging and penalty processing."""
import logging
from datetime import datetime, timezone as dt_timezone

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
from ..constants import ENVIRONMENT_RECHECK_EVENT_TYPES, INCIDENT_FAMILY, RESTORE_EVENT_TO_INCIDENT_FAMILY
from ..services.anti_cheat_session import (
    clear_incident_family,
    get_device_id,
    is_duplicate_exam_event,
    is_duplicate_incident_family,
    touch_heartbeat,
)
from ..services.exam_submission import finalize_submission, normalize_source_module
from ..services.evidence_windows import attach_evidence_window_metadata
from ..services.activity_log import log_contest_activity
from .exam_validation_response import validate_exam_operation_for_view
from apps.core.throttles import ExamEventsThrottle

logger = logging.getLogger(__name__)


class ExamEventsMixin:
    """Mixin for exam event logging and penalty logic."""

    MODULE_ROLE_PRIMARY = "primary"
    MODULE_ROLE_SECONDARY = "secondary"
    WEBCAM_STOPPED_EVENT = "webcam_stopped"
    VIEWPORT_STOPPED_EVENT = "viewport_stopped"
    STREAM_LOSS_EVENT_TYPES = {"screen_share_stopped", "webcam_stopped"}
    ANCHOR_WINDOW_EVIDENCE_EVENT_TYPES = {
        "exit_fullscreen",
        "exit_fullscreen_triggered",
        "forbidden_focus_event",
        "mouse_leave",
        "mouse_leave_triggered",
        "multiple_displays",
        "multi_display_triggered",
        "split_view_detected",
        "viewport_stopped",
    }

    def _normalize_upload_session_id(self, value) -> str:
        normalized = str(value or "").strip()
        return normalized or "default"

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

    def _extract_active_sources(self, metadata: dict) -> list[str]:
        if not isinstance(metadata, dict):
            return []
        raw_sources = metadata.get("active_sources")
        if not isinstance(raw_sources, list):
            return []
        sources: list[str] = []
        for item in raw_sources:
            normalized = normalize_source_module(item if isinstance(item, str) else None)
            if normalized not in sources:
                sources.append(normalized)
        return sources

    def _get_latest_exam_entered_metadata(self, contest, user, upload_session_id: str | None) -> dict:
        entry_events = ExamEvent.objects.filter(
            contest=contest,
            user=user,
            event_type="exam_entered",
        ).order_by("-created_at")
        target_session = self._normalize_upload_session_id(upload_session_id)

        for entry_event in entry_events:
            metadata = entry_event.metadata if isinstance(entry_event.metadata, dict) else {}
            event_session = self._normalize_upload_session_id(metadata.get("upload_session_id"))
            if event_session != target_session:
                continue
            return metadata

        latest = entry_events.first()
        if latest and isinstance(latest.metadata, dict):
            return latest.metadata
        return {}

    def _infer_primary_module_from_entry(self, metadata: dict) -> str:
        active_sources = self._extract_active_sources(metadata)
        primary_source_module = str(metadata.get("primary_source_module") or "").strip().lower()
        if primary_source_module in {"screen_share", "webcam"} and primary_source_module in active_sources:
            return primary_source_module
        if active_sources == ["webcam"]:
            return "webcam"
        if "screen_share" in active_sources:
            return "screen_share"
        if "webcam" in active_sources:
            return "webcam"
        device_kind = str(metadata.get("device_kind") or "").strip().lower()
        if device_kind == "tablet":
            return "webcam"
        return "screen_share"

    def _resolve_module_context(self, contest, user, event_type: str, metadata: dict) -> tuple[str, str]:
        module = normalize_source_module(metadata.get("module"))
        if event_type.startswith("webcam_"):
            module = "webcam"
        elif event_type.startswith("screen_share_"):
            module = "screen_share"

        module_role_raw = str(metadata.get("module_role") or "").strip().lower()
        if module_role_raw in {self.MODULE_ROLE_PRIMARY, self.MODULE_ROLE_SECONDARY}:
            return module, module_role_raw

        entry_metadata = self._get_latest_exam_entered_metadata(
            contest,
            user,
            metadata.get("upload_session_id"),
        )
        primary_module = self._infer_primary_module_from_entry(entry_metadata)

        if event_type == self.WEBCAM_STOPPED_EVENT:
            if primary_module == "webcam":
                return module, self.MODULE_ROLE_PRIMARY
            return module, self.MODULE_ROLE_SECONDARY

        if event_type == "screen_share_stopped":
            if primary_module == "screen_share":
                return module, self.MODULE_ROLE_PRIMARY
            return module, self.MODULE_ROLE_SECONDARY

        if event_type == self.VIEWPORT_STOPPED_EVENT:
            device_kind = str(
                entry_metadata.get("device_kind") or metadata.get("device_kind") or ""
            ).strip().lower()
            if device_kind == "tablet" or primary_module == "webcam":
                return module, self.MODULE_ROLE_PRIMARY
            return module, self.MODULE_ROLE_SECONDARY

        return module, self.MODULE_ROLE_SECONDARY

    def _is_immediate_lock_event(self, event_type: str, module_role: str) -> bool:
        return event_type in self.IMMEDIATE_LOCK_EVENT_TYPES

    def _requires_recheck_pause(self, event_type: str, module_role: str) -> bool:
        if event_type in {self.WEBCAM_STOPPED_EVENT, self.VIEWPORT_STOPPED_EVENT}:
            return module_role == self.MODULE_ROLE_PRIMARY
        return event_type in ENVIRONMENT_RECHECK_EVENT_TYPES

    def _environment_pause_reason(self, event_type: str) -> str:
        if event_type == "heartbeat_timeout":
            return "Heartbeat timeout: no client signal received for 60 seconds; pre-check is required to continue"
        if event_type == "listener_tampered":
            return "Listener tampered: anti-cheat integrity check failed; pre-check is required to continue"
        if event_type == "exit_fullscreen":
            return "Fullscreen recovery timed out; pre-check is required to continue"
        if event_type == "screen_share_stopped":
            return "Screen share recovery timed out; pre-check is required to continue"
        if event_type == self.WEBCAM_STOPPED_EVENT:
            return "Webcam recovery timed out; pre-check is required to continue"
        if event_type == self.VIEWPORT_STOPPED_EVENT:
            return "Viewport integrity recovery timed out; pre-check is required to continue"
        if event_type == "split_view_detected":
            return "Split view detected; pre-check is required to continue"
        if event_type == "multiple_displays":
            return "Multiple displays detected; pre-check is required to continue"
        return f"Monitoring recovery required: {event_type}"

    def _parse_evidence_ms(self, value) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return int(value) if value >= 0 else None
        if isinstance(value, str):
            try:
                parsed = int(float(value))
            except ValueError:
                return None
            return parsed if parsed >= 0 else None
        return None

    def _evidence_anchor_iso(self, anchor_ms: int) -> str:
        return datetime.fromtimestamp(anchor_ms / 1000, tz=dt_timezone.utc).isoformat().replace("+00:00", "Z")

    def _normalize_evidence_metadata(self, event_type: str, metadata: dict, validated_data: dict) -> dict:
        normalized = dict(metadata or {})
        for key in (
            "client_observed_at_ms",
            "server_time_offset_ms",
            "evidence_anchor_at_ms",
            "evidence_mode",
            "event_idempotency_key",
        ):
            if key in validated_data and validated_data.get(key) not in (None, ""):
                normalized[key] = validated_data[key]

        evidence_requested = (
            event_type in self.PENALIZED_EVENT_TYPES
            or event_type in self.ANCHOR_WINDOW_EVIDENCE_EVENT_TYPES
            or bool(normalized.get("forced_capture_requested"))
            or self._parse_evidence_ms(normalized.get("evidence_anchor_at_ms")) is not None
        )
        if not evidence_requested:
            return normalized

        anchor_ms = self._parse_evidence_ms(normalized.get("evidence_anchor_at_ms"))
        if anchor_ms is None:
            anchor_ms = self._parse_evidence_ms(normalized.get("client_observed_at_ms"))
        if anchor_ms is None:
            anchor_ms = int(timezone.now().timestamp() * 1000)

        evidence_mode = str(normalized.get("evidence_mode") or "").strip()
        if not evidence_mode:
            evidence_mode = "pre_loss" if event_type in self.STREAM_LOSS_EVENT_TYPES else "anchor_window"

        normalized["evidence_anchor_at_ms"] = anchor_ms
        normalized["evidence_anchor_at"] = self._evidence_anchor_iso(anchor_ms)
        normalized["client_observed_at_ms"] = self._parse_evidence_ms(
            normalized.get("client_observed_at_ms")
        ) or anchor_ms
        normalized["evidence_mode"] = evidence_mode
        if evidence_mode == "pre_loss":
            normalized.setdefault("loss_detected_at_ms", anchor_ms)
        return normalized

    def _event_response_metadata(self, event: ExamEvent | None) -> dict:
        if event is None:
            return {}
        metadata = event.metadata if isinstance(event.metadata, dict) else {}
        return {
            "event_id": event.id,
            "evidence_cluster_id": metadata.get("evidence_cluster_id") or "",
            "evidence_window_start": metadata.get("evidence_window_start"),
            "evidence_window_end": metadata.get("evidence_window_end"),
            "evidence_mode": metadata.get("evidence_mode"),
            "evidence_anchor_at_ms": metadata.get("evidence_anchor_at_ms"),
        }

    def _build_event_response(self, participant, contest):
        return {
            'exam_status': participant.exam_status,
            'violation_count': participant.violation_count,
            'max_cheat_warnings': contest.max_cheat_warnings,
            'locked': participant.exam_status == ExamStatus.LOCKED,
            'submit_reason': participant.submit_reason or "",
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
        - in_progress: critical monitoring failure => pause for pre-check
        - locked: manual TA lock remains terminal until TA action / configured unlock
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
        requires_recheck_pause = self._requires_recheck_pause(event_type, normalized_role)
        should_escalate = force_lock or requires_recheck_pause

        if should_escalate:
            if participant.exam_status == ExamStatus.IN_PROGRESS:
                if force_lock:
                    participant.exam_status = ExamStatus.LOCKED
                    participant.locked_at = timezone.now()
                    if event_type == "screen_share_stopped":
                        participant.lock_reason = "Screen share stopped during exam session"
                    elif event_type == self.WEBCAM_STOPPED_EVENT:
                        participant.lock_reason = "Webcam stopped during exam session"
                    elif event_type == self.VIEWPORT_STOPPED_EVENT:
                        participant.lock_reason = "Viewport integrity lost during exam session"
                    else:
                        participant.lock_reason = f"System lock (immediate): {event_type}"
                    update_fields.extend(['exam_status', 'locked_at', 'lock_reason'])
                    participant.save(update_fields=update_fields)
                    log_contest_activity(
                        contest,
                        actor,
                        'lock_user',
                        f"Auto-locked due to {event_type}"
                    )
                    return participant
                else:
                    participant.exam_status = ExamStatus.PAUSED
                    participant.locked_at = None
                    participant.lock_reason = self._environment_pause_reason(event_type)
                    update_fields.extend(['exam_status', 'locked_at', 'lock_reason'])
                participant.save(update_fields=update_fields)
                log_contest_activity(
                    contest,
                    actor,
                    'update_participant',
                    f"Paused for monitoring re-check due to {event_type}"
                )
                return participant

            participant.save(update_fields=update_fields)
            return participant

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
        participant, error_response = validate_exam_operation_for_view(
            contest, request.user, require_in_progress=False, allow_admin_bypass=False
        )
        if error_response is not None:
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

        if event_type == "heartbeat":
            if participant.exam_status not in self.MONITORED_STATUSES:
                return Response(
                    {
                        "ok": False,
                        "event_type": event_type,
                        "decision": "ignored",
                        "exam_status": participant.exam_status,
                    }
                )
            touch_heartbeat(contest.id, request.user.id)
            return Response(
                {
                    "ok": True,
                    "event_type": event_type,
                    "decision": "heartbeat",
                    "exam_status": participant.exam_status,
                }
            )

        # Non-heartbeat events also refresh liveness, but only meaningful events
        # are persisted to ExamEvent. High-frequency heartbeat stays Redis-only.
        touch_heartbeat(contest.id, request.user.id)

        if event_type == "exam_entered":
            metadata = self._enrich_exam_entered_metadata(request, metadata)
        metadata = self._normalize_evidence_metadata(event_type, metadata, serializer.validated_data)
        source_module, module_role = self._resolve_module_context(
            contest,
            request.user,
            event_type,
            metadata,
        )
        metadata.setdefault("module", source_module)
        metadata.setdefault("module_role", module_role)
        upload_session_id = str(metadata.get("upload_session_id") or "").strip() or None
        event_phase = str(metadata.get("phase") or "").upper()
        idempotency_token = str(metadata.get("event_idempotency_key") or "").strip()
        existing_event = None

        if is_duplicate_exam_event(
            contest_id=contest.id,
            user_id=request.user.id,
            event_type=event_type,
            token=idempotency_token or None,
        ):
            if idempotency_token:
                existing_event = (
                    ExamEvent.objects.filter(
                        contest=contest,
                        user=request.user,
                        event_type=event_type,
                        metadata__event_idempotency_key=idempotency_token,
                    )
                    .order_by("-created_at")
                    .first()
                )
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
                    **self._event_response_metadata(existing_event),
                }
            )
            return Response(payload)

        if participant.exam_status == ExamStatus.SUBMITTED:
            event = ExamEvent.objects.create(
                contest=contest,
                user=request.user,
                event_type=event_type,
                metadata=metadata,
            )
            event = attach_evidence_window_metadata(event)
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
                    **self._event_response_metadata(event),
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
            family = INCIDENT_FAMILY.get(event_type)
            family_dup = family and is_duplicate_incident_family(
                contest_id=contest.id,
                user_id=request.user.id,
                family=family,
            )
            with transaction.atomic():
                metadata["incident_family"] = family
                metadata["incident_family_dup"] = bool(family_dup)
                event = ExamEvent.objects.create(
                    contest=contest,
                    user=request.user,
                    event_type=event_type,
                    metadata=metadata
                )
                event = attach_evidence_window_metadata(event)
                if not family_dup:
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
            event = ExamEvent.objects.create(
                contest=contest,
                user=request.user,
                event_type=event_type,
                metadata=metadata
            )
            event = attach_evidence_window_metadata(event)
            clear_incident_family(
                contest_id=contest.id,
                user_id=request.user.id,
                family=RESTORE_EVENT_TO_INCIDENT_FAMILY.get(event_type),
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
                **self._event_response_metadata(event),
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
