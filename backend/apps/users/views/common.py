"""Shared helpers for split user view modules."""

from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.response import Response

from rest_framework_simplejwt.tokens import AccessToken

from ..authentication import set_jwt_cookies
from ..services import JWTService
from ..models import UserLoginRecord
from apps.contests.models import ContestActivity, ContestParticipant, ExamEvent, ExamStatus
from apps.contests.services.anti_cheat_session import (
    consume_conflict_token,
    find_exam_conflict,
    get_device_id,
    set_active_session,
)

class SchemaAPIView(generics.GenericAPIView):
    """APIView with serializer support for schema generation."""

    serializer_class = serializers.Serializer


def validation_error_response(message: str, details) -> Response:
    return Response(
        {
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": message,
                "details": details,
            },
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def token_cookie_response(
    user,
    tokens: dict,
    *,
    status_code: int = status.HTTP_200_OK,
    message: str | None = None,
    extra_data: dict | None = None,
) -> Response:
    payload = JWTService.get_user_response_data(user, tokens)
    if extra_data:
        payload.setdefault("data", {}).update(extra_data)
    if message:
        payload["message"] = message

    response = Response(payload, status=status_code)
    set_jwt_cookies(response, tokens)
    return response


def record_login(user, request, login_method: str, jti: str = "") -> UserLoginRecord:
    """Create a UserLoginRecord for the given login event."""
    from apps.contests.services.anti_cheat_session import get_client_ip
    device_id = get_device_id(request)
    ip = get_client_ip(request)
    ua = request.META.get("HTTP_USER_AGENT", "")[:512]

    # Mark all previous records for this user as not current
    UserLoginRecord.objects.filter(user=user, is_current=True).update(is_current=False)

    return UserLoginRecord.objects.create(
        user=user,
        device_id=device_id,
        ip_address=ip or "0.0.0.0",
        user_agent=ua,
        login_method=login_method,
        jti=jti,
        is_current=True,
    )


def build_conflict_response(user, request, provider: str):
    """Block login when the user has an active exam on another device.

    Always returns 403 — no takeover option.  The attempt is recorded as
    an ExamEvent + ContestActivity for the invigilator dashboard.
    """
    device_id = get_device_id(request)
    conflict = find_exam_conflict(user, device_id)
    if not conflict:
        return None

    contest = conflict.contest

    # Record the attempt
    ExamEvent.objects.create(
        contest=contest,
        user=user,
        event_type="concurrent_login_blocked",
        metadata={
            "source": f"auth_{provider}",
            "incoming_device_id": device_id,
            "existing_device_id": (conflict.active_session or {}).get("device_id", ""),
        },
    )
    ContestActivity.objects.create(
        contest=contest,
        user=user,
        action_type="concurrent_login_blocked",
        details=(
            f"Blocked login from another device during exam "
            f"(provider={provider}, device_id={device_id})"
        ),
    )

    return Response(
        {
            "success": False,
            "code": "EXAM_LOGIN_BLOCKED",
            "message": "考試進行中，無法從其他裝置登入。請在原裝置完成考試後再試。",
            "active_exam": {
                "contest_id": contest.id,
                "contest_name": contest.name,
                "exam_status": conflict.participant.exam_status,
                "started_at": conflict.participant.started_at,
            },
        },
        status=status.HTTP_403_FORBIDDEN,
    )
def consume_conflict_payload_or_error(conflict_token: str):
    payload = consume_conflict_token(conflict_token)
    if payload:
        return payload, None
    return None, Response(
        {
            "success": False,
            "error": {
                "code": "INVALID_CONFLICT_TOKEN",
                "message": "Conflict token is invalid or expired.",
            },
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def perform_takeover_lock(*, user_model, request, payload: dict):
    user_id = payload.get("user_id")
    participant_id = payload.get("participant_id")
    if not user_id or not participant_id:
        return Response(
            {
                "success": False,
                "error": {
                    "code": "INVALID_CONFLICT_PAYLOAD",
                    "message": "Malformed conflict payload.",
                },
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.db import transaction

    try:
        with transaction.atomic():
            user = user_model.objects.get(id=user_id, is_active=True)
            participant = ContestParticipant.objects.select_related("contest").select_for_update().get(
                id=participant_id,
                user_id=user_id,
            )
            contest = participant.contest

            if participant.exam_status in [
                ExamStatus.IN_PROGRESS,
                ExamStatus.PAUSED,
                ExamStatus.LOCKED,
            ]:
                participant.exam_status = ExamStatus.LOCKED_TAKEOVER
                participant.locked_at = timezone.now()
                participant.lock_reason = "Device takeover requested during login conflict"
                participant.save(update_fields=["exam_status", "locked_at", "lock_reason"])

                ExamEvent.objects.create(
                    contest=contest,
                    user=user,
                    event_type="takeover_locked",
                    metadata={
                        "source": "resolve_conflict",
                        "requested_device_id": payload.get("device_id", ""),
                    },
                )
                ContestActivity.objects.create(
                    contest=contest,
                    user=user,
                    action_type="takeover_lock",
                    details=(
                        "Locked exam session due to device takeover request "
                        f"(device_id={payload.get('device_id', '')})"
                    ),
                )

            set_active_session(
                contest=contest,
                participant=participant,
                request=request,
                device_id=str(payload.get("device_id") or get_device_id(request)),
            )

            tokens = JWTService.generate_tokens(user)
            access_jti = str(AccessToken(tokens["access"]).get("jti", ""))
            record_login(user, request, login_method="takeover", jti=access_jti)
            return token_cookie_response(user, tokens)
    except (user_model.DoesNotExist, ContestParticipant.DoesNotExist):
        return Response(
            {
                "success": False,
                "error": {
                    "code": "CONFLICT_TARGET_NOT_FOUND",
                    "message": "Target session no longer exists.",
                },
            },
            status=status.HTTP_404_NOT_FOUND,
        )
