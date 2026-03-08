"""ExamAnticheatMixin — anticheat URLs, active sessions, takeover."""
from datetime import timedelta

from django.utils import timezone
from django.conf import settings
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
    AnticheatUrlsQuerySerializer,
    ActiveSessionClearSerializer,
    ExamTakeoverApproveSerializer,
)
from ..permissions import can_manage_contest
from ..services.anti_cheat_session import (
    clear_active_session,
    get_active_session,
    get_device_id,
    set_active_session,
)
from ..services.anticheat_storage import (
    build_raw_object_key,
    build_upload_session_id,
    generate_put_url,
)
from ..services.exam_validation import validate_exam_operation
from .activity import ContestActivityViewSet
from apps.core.throttles import ExamAnticheatUrlsThrottle


class ExamAnticheatMixin:
    """Mixin for anticheat URL generation, active sessions, and takeover."""

    def _conflict_payload(self, contest, participant):
        return {
            "code": "EXAM_ACTIVE_OTHER_DEVICE",
            "message": "Another device is currently active for this exam session.",
            "active_exam": {
                "contest_id": contest.id,
                "contest_name": contest.name,
                "exam_status": participant.exam_status,
                "started_at": participant.started_at,
            },
        }

    def _ensure_active_device_session(self, contest, participant, request):
        device_id = get_device_id(request)
        active = get_active_session(contest.id, participant.user_id)
        if active and active.get("device_id") and active.get("device_id") != device_id:
            ExamEvent.objects.create(
                contest=contest,
                user=participant.user,
                event_type="concurrent_login_detected",
                metadata={
                    "existing_device_id": active.get("device_id"),
                    "incoming_device_id": device_id,
                    "source": "exam_api",
                },
            )
            return Response(self._conflict_payload(contest, participant), status=status.HTTP_409_CONFLICT)
        set_active_session(contest, participant, request, device_id)
        return None

    @action(
        detail=False,
        methods=['get'],
        url_path='anticheat-urls',
        permission_classes=[permissions.IsAuthenticated],
        throttle_classes=[ExamAnticheatUrlsThrottle],
    )
    def anticheat_urls(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        participant, error_response = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error_response:
            return error_response
        if participant is None:
            return Response({'error': 'Not registered'}, status=status.HTTP_400_BAD_REQUEST)
        if participant.exam_status not in self.MONITORED_STATUSES:
            return Response(
                {'error': f'Cannot issue anticheat upload URLs in status: {participant.exam_status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conflict_response = self._ensure_active_device_session(contest, participant, request)
        if conflict_response:
            return conflict_response

        query_serializer = AnticheatUrlsQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        count = query_serializer.validated_data["count"]
        interval = settings.ANTICHEAT_CAPTURE_INTERVAL_SECONDS
        max_safe_count = max(1, settings.ANTICHEAT_PRESIGNED_URL_TTL_SECONDS // interval - 10)
        count = min(count, max_safe_count)

        upload_session_id = str(query_serializer.validated_data.get("upload_session_id") or "").strip()
        if not upload_session_id:
            upload_session_id = build_upload_session_id()
        start_seq = int(query_serializer.validated_data.get("start_seq") or 1)
        base_ts = int(timezone.now().timestamp() * 1000)
        items = []
        for i in range(count):
            seq = start_seq + i
            ts_ms = base_ts + i * 10_000
            object_key = build_raw_object_key(
                contest_id=contest.id,
                user_id=request.user.id,
                upload_session_id=upload_session_id,
                ts_ms=ts_ms,
                seq=seq,
            )
            put_url = generate_put_url(
                settings.ANTICHEAT_RAW_BUCKET,
                object_key,
                expires_seconds=settings.ANTICHEAT_PRESIGNED_URL_TTL_SECONDS,
            )
            items.append(
                {
                    "seq": seq,
                    "object_key": object_key,
                    "put_url": put_url,
                    "required_headers": {
                        "Content-Type": "image/webp",
                        "x-amz-tagging": "cleanup=true",
                    },
                }
            )

        return Response(
            {
                "upload_session_id": upload_session_id,
                "expires_at": timezone.now() + timedelta(seconds=settings.ANTICHEAT_PRESIGNED_URL_TTL_SECONDS),
                "interval_seconds": settings.ANTICHEAT_CAPTURE_INTERVAL_SECONDS,
                "next_seq": start_seq + count,
                "throttle_scope": "exam_anticheat_urls",
                "server_time": timezone.now(),
                "items": items,
            }
        )

    @action(detail=False, methods=["get"], url_path="active-sessions")
    def active_sessions(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )

        participants = ContestParticipant.objects.filter(
            contest=contest,
            exam_status__in=[ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED, ExamStatus.LOCKED_TAKEOVER],
        ).select_related("user")
        rows = []
        for participant in participants:
            session_data = get_active_session(contest.id, participant.user_id)
            if not session_data:
                continue
            rows.append(
                {
                    "user_id": participant.user_id,
                    "username": participant.user.username,
                    "exam_status": participant.exam_status,
                    "started_at": participant.started_at,
                    "session": session_data,
                }
            )
        return Response(rows)

    @action(detail=False, methods=["post"], url_path="active-sessions/clear")
    def clear_active_session(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = ActiveSessionClearSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = serializer.validated_data["user_id"]
        clear_active_session(contest.id, user_id)
        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            "update_participant",
            f"Cleared active session for user_id={user_id}",
        )
        return Response({"status": "cleared", "user_id": user_id})

    @action(detail=False, methods=["post"], url_path="takeover-approve")
    def takeover_approve(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = ExamTakeoverApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = serializer.validated_data["user_id"]
        participant = get_object_or_404(ContestParticipant, contest=contest, user_id=user_id)
        if participant.exam_status != ExamStatus.LOCKED_TAKEOVER:
            return Response(
                {"error": "Participant is not in takeover-locked state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant.exam_status = ExamStatus.PAUSED
        participant.lock_reason = ""
        participant.locked_at = None
        participant.save(update_fields=["exam_status", "lock_reason", "locked_at"])
        ExamEvent.objects.create(
            contest=contest,
            user=participant.user,
            event_type="takeover_approved",
            metadata={"approved_by": request.user.id},
        )
        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            "takeover_approve",
            f"Approved takeover for user_id={participant.user_id}",
        )
        return Response({"status": "approved", "exam_status": participant.exam_status})
