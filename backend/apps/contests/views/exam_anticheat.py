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
    ExamStatus,
)
from ..serializers import (
    AnticheatUrlsQuerySerializer,
    ActiveSessionClearSerializer,
)
from ..permissions import can_manage_contest
from ..services.anti_cheat_session import (
    clear_active_session,
    get_active_sessions,
    get_device_id,
    set_active_session,
    touch_heartbeat,
)
from ..services.anticheat_storage import (
    build_raw_object_key,
    build_upload_session_id,
    generate_put_url,
    get_s3_client,
)
from .activity import ContestActivityViewSet
from .exam_validation_response import (
    build_device_conflict_response_for_view,
    validate_exam_operation_for_view,
)
from apps.core.throttles import ExamAnticheatUrlsThrottle
from ..constants import WEBCAM_CAPTURE_INTERVAL_SECONDS


class ExamAnticheatMixin:
    """Mixin for anticheat URL generation, active sessions, and takeover."""

    def _ensure_active_device_session(self, contest, participant, request):
        """Delegate to the shared helper, then refresh the active session."""
        conflict_response = build_device_conflict_response_for_view(contest, participant, request)
        if conflict_response is not None:
            return conflict_response
        set_active_session(contest, participant, request, get_device_id(request))
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
        participant, error_response = validate_exam_operation_for_view(
            contest, request.user, require_in_progress=False
        )
        if error_response is not None:
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

        touch_heartbeat(contest.id, request.user.id)

        query_serializer = AnticheatUrlsQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        module = str(query_serializer.validated_data.get("module") or "screen_share")
        count = query_serializer.validated_data["count"]
        if module == "webcam":
            interval = WEBCAM_CAPTURE_INTERVAL_SECONDS
        else:
            interval = settings.ANTICHEAT_CAPTURE_INTERVAL_SECONDS
        max_safe_count = max(1, settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS // interval - 10)
        count = min(count, max_safe_count)

        upload_session_id = str(query_serializer.validated_data.get("upload_session_id") or "").strip()
        if not upload_session_id:
            upload_session_id = build_upload_session_id()
        start_seq = int(query_serializer.validated_data.get("start_seq") or 1)
        base_ts = int(timezone.now().timestamp() * 1000)
        presign_client = get_s3_client(
            endpoint_url=(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip() or None
        )
        items = []
        for i in range(count):
            seq = start_seq + i
            ts_ms = base_ts + i * interval * 1_000
            object_key = build_raw_object_key(
                contest_id=contest.id,
                user_id=request.user.id,
                upload_session_id=upload_session_id,
                ts_ms=ts_ms,
                seq=seq,
                module=module,
            )
            put_url = generate_put_url(
                settings.ANTICHEAT_RAW_BUCKET,
                object_key,
                expires_seconds=settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS,
                client=presign_client,
            )
            items.append(
                {
                    "seq": seq,
                    "object_key": object_key,
                    "module": module,
                    "put_url": put_url,
                    "required_headers": {
                        "Content-Type": "image/webp",
                        **(
                            {"x-amz-tagging": "cleanup=true"}
                            if settings.OBJECT_STORAGE_OBJECT_TAGGING_ENABLED
                            else {}
                        ),
                    },
                }
            )

        return Response(
            {
                "upload_session_id": upload_session_id,
                "module": module,
                "expires_at": timezone.now() + timedelta(seconds=settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS),
                "interval_seconds": interval,
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
            exam_status__in=[ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED],
        ).select_related("user")
        participants = list(participants)
        active_sessions = get_active_sessions(contest.id, [participant.user_id for participant in participants])
        rows = []
        for participant in participants:
            session_data = active_sessions.get(participant.user_id)
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
