"""Cloudflare Realtime SFU live monitoring endpoints."""
from __future__ import annotations

import logging

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Contest, ContestParticipant
from ..permissions import can_manage_contest
from ..services.realtime_sfu import (
    RealtimeSfuClient,
    RealtimeSfuError,
    build_room_id,
    get_realtime_sfu_config,
)
from ..services.realtime_sfu_registry import (
    extract_first_local_track_name,
    get_publisher,
    get_publishers,
    refresh_publisher,
    register_publisher,
    remove_publisher,
)
from .exam_validation_response import validate_exam_operation_for_view


logger = logging.getLogger(__name__)


def _sfu_error_response(exc: RealtimeSfuError) -> Response:
    status_code = exc.status_code or status.HTTP_502_BAD_GATEWAY
    if status_code >= 500 and status_code != status.HTTP_503_SERVICE_UNAVAILABLE:
        status_code = status.HTTP_502_BAD_GATEWAY
    logger.warning(
        "Realtime SFU proxy request failed",
        extra={
            "upstream_status": exc.status_code,
            "upstream_payload": exc.payload,
            "error": str(exc),
        },
    )
    message = "Live monitoring is temporarily unavailable."
    if status_code == status.HTTP_403_FORBIDDEN:
        message = "Live monitoring is disabled."
    elif status_code == status.HTTP_503_SERVICE_UNAVAILABLE:
        message = "Live monitoring is not configured."
    return Response(
        {"error": message},
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
            participant, error_response = validate_exam_operation_for_view(
                contest,
                request.user,
                require_in_progress=False,
                allow_admin_bypass=False,
            )
            if error_response is not None:
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

        participant = None
        if role == "subscriber":
            if not can_manage_contest(request.user, contest):
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        else:
            participant, error_response = validate_exam_operation_for_view(
                contest,
                request.user,
                require_in_progress=False,
                allow_admin_bypass=False,
            )
            if error_response is not None:
                return error_response
            if participant is None:
                return Response({"error": "Not registered"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response_payload = RealtimeSfuClient().add_tracks(str(session_id), payload)
        except RealtimeSfuError as exc:
            return _sfu_error_response(exc)

        if role != "subscriber" and participant is not None:
            track_name = extract_first_local_track_name(payload)
            if track_name:
                response_payload["publisher"] = register_publisher(
                    contest_id=contest.id,
                    user_id=participant.user_id,
                    session_id=str(session_id),
                    track_name=track_name,
                    room_id=build_room_id(contest.id, participant.user_id),
                )

        return Response(response_payload)

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

    @action(
        detail=False,
        methods=["get"],
        url_path=r"sfu/publishers/(?P<target_user_id>\d+)",
        permission_classes=[permissions.IsAuthenticated],
    )
    def sfu_get_publisher(self, request, contest_pk=None, target_user_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        target = ContestParticipant.objects.filter(
            contest=contest,
            user_id=target_user_id,
        ).first()
        if not target:
            return Response({"error": "target participant not found"}, status=status.HTTP_404_NOT_FOUND)
        source_module = str(request.query_params.get("source_module") or "").strip()
        if source_module:
            publisher = get_publisher(contest.id, target.user_id, source_module=source_module)
            return Response(
                {
                    "active": bool(publisher),
                    "publisher": publisher,
                    "publishers": [publisher] if publisher else [],
                }
            )
        publishers = get_publishers(contest.id, target.user_id)
        publisher = get_publisher(contest.id, target.user_id)
        return Response({"active": bool(publishers), "publisher": publisher, "publishers": publishers})

    @action(
        detail=False,
        methods=["post"],
        url_path="sfu/publisher/heartbeat",
        permission_classes=[permissions.IsAuthenticated],
    )
    def sfu_publisher_heartbeat(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        participant, error_response = validate_exam_operation_for_view(
            contest,
            request.user,
            require_in_progress=False,
            allow_admin_bypass=False,
        )
        if error_response is not None:
            return error_response
        if participant is None:
            return Response({"error": "Not registered"}, status=status.HTTP_400_BAD_REQUEST)
        source_module = str(request.data.get("source_module") or "").strip()
        publisher = refresh_publisher(
            contest.id,
            participant.user_id,
            source_module=source_module or None,
        )
        publishers = get_publishers(contest.id, participant.user_id)
        return Response({"active": bool(publishers), "publisher": publisher, "publishers": publishers})

    @action(
        detail=False,
        methods=["post"],
        url_path="sfu/publisher/stop",
        permission_classes=[permissions.IsAuthenticated],
    )
    def sfu_publisher_stop(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        participant = ContestParticipant.objects.filter(contest=contest, user=request.user).first()
        if not participant:
            return Response({"error": "Not registered"}, status=status.HTTP_400_BAD_REQUEST)
        session_id = request.data.get("session_id")
        source_module = str(request.data.get("source_module") or "").strip()
        remaining = remove_publisher(
            contest.id,
            participant.user_id,
            session_id=str(session_id) if session_id else None,
            source_module=source_module or None,
        )
        publishers = get_publishers(contest.id, participant.user_id)
        return Response({"active": bool(publishers), "publisher": remaining, "publishers": publishers})
