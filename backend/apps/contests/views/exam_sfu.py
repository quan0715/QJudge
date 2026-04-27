"""Dev-gated Cloudflare Realtime SFU spike endpoints."""
from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Contest, ContestParticipant
from ..permissions import can_manage_contest
from ..services.exam_validation import validate_exam_operation
from ..services.realtime_sfu import (
    RealtimeSfuClient,
    RealtimeSfuError,
    build_room_id,
    get_realtime_sfu_config,
)


def _sfu_error_response(exc: RealtimeSfuError) -> Response:
    status_code = exc.status_code or status.HTTP_502_BAD_GATEWAY
    if status_code >= 500 and status_code != status.HTTP_503_SERVICE_UNAVAILABLE:
        status_code = status.HTTP_502_BAD_GATEWAY
    return Response(
        {
            "error": str(exc),
            "upstream_status": exc.status_code,
            "upstream_payload": exc.payload,
        },
        status=status_code,
    )


class ExamSfuMixin:
    """Small broker layer for validating Cloudflare Realtime SFU feasibility."""

    @action(
        detail=False,
        methods=["get"],
        url_path="sfu/config",
        permission_classes=[permissions.IsAuthenticated],
    )
    def sfu_config(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        participant = ContestParticipant.objects.filter(contest=contest, user=request.user).first()
        if not participant and not can_manage_contest(request.user, contest):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        config = get_realtime_sfu_config()
        return Response(
            {
                "enabled": config.enabled,
                "configured": config.configured,
                "app_id": config.app_id if config.configured else "",
                "stun_urls": list(config.stun_urls),
            }
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="sfu/sessions",
        permission_classes=[permissions.IsAuthenticated],
    )
    def sfu_create_session(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        role = str(request.data.get("role") or "publisher").strip()

        if role == "subscriber":
            if not can_manage_contest(request.user, contest):
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
            target_user_id = request.data.get("target_user_id")
            if target_user_id:
                target = ContestParticipant.objects.filter(
                    contest=contest,
                    user_id=target_user_id,
                ).first()
                if not target:
                    return Response({"error": "target participant not found"}, status=status.HTTP_404_NOT_FOUND)
                room_id = build_room_id(contest.id, target.user_id)
            else:
                room_id = f"{build_room_id(contest.id, request.user.id)}-subscriber"
        else:
            participant, error_response = validate_exam_operation(
                contest,
                request.user,
                require_in_progress=False,
                allow_admin_bypass=False,
            )
            if error_response:
                return error_response
            if participant is None:
                return Response({"error": "Not registered"}, status=status.HTTP_400_BAD_REQUEST)
            room_id = build_room_id(contest.id, participant.user_id)

        try:
            payload = RealtimeSfuClient().create_session(correlation_id=room_id)
        except RealtimeSfuError as exc:
            return _sfu_error_response(exc)

        payload["room_id"] = room_id
        payload["role"] = role
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=["post"],
        url_path=r"sfu/sessions/(?P<session_id>[^/.]+)/tracks/new",
        permission_classes=[permissions.IsAuthenticated],
    )
    def sfu_add_tracks(self, request, contest_pk=None, session_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        role = str(request.data.get("role") or "").strip()
        payload = request.data.get("payload")
        if not isinstance(payload, dict):
            return Response({"error": "payload is required"}, status=status.HTTP_400_BAD_REQUEST)

        if role == "subscriber":
            if not can_manage_contest(request.user, contest):
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        else:
            participant, error_response = validate_exam_operation(
                contest,
                request.user,
                require_in_progress=False,
                allow_admin_bypass=False,
            )
            if error_response:
                return error_response
            if participant is None:
                return Response({"error": "Not registered"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            return Response(RealtimeSfuClient().add_tracks(str(session_id), payload))
        except RealtimeSfuError as exc:
            return _sfu_error_response(exc)

    @action(
        detail=False,
        methods=["put"],
        url_path=r"sfu/sessions/(?P<session_id>[^/.]+)/renegotiate",
        permission_classes=[permissions.IsAuthenticated],
    )
    def sfu_renegotiate(self, request, contest_pk=None, session_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not (
            can_manage_contest(request.user, contest)
            or ContestParticipant.objects.filter(contest=contest, user=request.user).exists()
        ):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data.get("payload")
        if not isinstance(payload, dict):
            return Response({"error": "payload is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(RealtimeSfuClient().renegotiate(str(session_id), payload))
        except RealtimeSfuError as exc:
            return _sfu_error_response(exc)
