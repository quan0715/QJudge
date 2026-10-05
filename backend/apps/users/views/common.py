"""Shared helpers for split user view modules."""

from rest_framework import generics, serializers, status
from django.db import transaction
from rest_framework.response import Response
from apps.core.api.envelope import contract_error_response, contract_validation_error_response
from apps.core.api.renderer import ContractJSONRenderer
from rest_framework_simplejwt.tokens import AccessToken

from ..schema import UserContractSchema

from ..authentication import set_jwt_cookies
from ..services import JWTService
from ..models import UserLoginRecord
from apps.contests.models import ExamEvent
from apps.contests.services.activity_log import log_contest_activity
from apps.contests.services.anti_cheat_session import (
    find_exam_conflict,
    get_device_id,
    renew_exam_login,
)

class SchemaAPIView(generics.GenericAPIView):
    """APIView with serializer support for schema generation."""

    schema = UserContractSchema()
    pagination_class = None
    api_contract_enabled = True
    renderer_classes = [ContractJSONRenderer]
    serializer_class = serializers.Serializer


def validation_error_response(request, message: str, details) -> Response:
    return contract_validation_error_response(request, message, details)


def password_auth_disabled_response(request) -> Response:
    return contract_error_response(request, 'PASSWORD_AUTH_DISABLED', '密碼憑證登入已停用，請使用學校 SSO 或其他已啟用的登入方式', status=status.HTTP_403_FORBIDDEN)


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
        payload.update(extra_data)

    response = Response(payload, status=status_code)
    set_jwt_cookies(response, tokens)
    return response


def record_login(user, request, login_method: str, tokens: dict) -> UserLoginRecord:
    """Create a UserLoginRecord for the given login event."""
    from apps.contests.services.anti_cheat_session import get_client_ip
    device_id = get_device_id(request)
    ip = get_client_ip(request)
    ua = request.META.get("HTTP_USER_AGENT", "")[:512]
    access = AccessToken(tokens["access"])
    renew_exam_login(user.id, device_id, access["session_jti"])

    # Mark all previous records for this user as not current
    UserLoginRecord.objects.filter(user=user, is_current=True).update(is_current=False)

    return UserLoginRecord.objects.create(
        user=user,
        device_id=device_id,
        ip_address=ip or "0.0.0.0",
        user_agent=ua,
        login_method=login_method,
        jti=str(access["jti"]),
        is_current=True,
    )


def build_active_exam_login_block_response(user, request, provider: str):
    """Return a policy block when the user has an active exam on another device."""
    device_id = get_device_id(request)
    conflict = find_exam_conflict(user, device_id)
    if not conflict:
        return None

    contest = conflict.contest

    def write_conflict_audit():
        ExamEvent.objects.create(
            contest=contest,
            user=user,
            event_type="concurrent_login_detected",
            metadata={
                "source": f"auth_{provider}",
                "incoming_device_id": device_id,
                "existing_device_id": (conflict.active_session or {}).get("device_id", ""),
            },
        )
        log_contest_activity(
            contest=contest,
            user=user,
            action_type="concurrent_login_detected",
            details=(
                f"Blocked login from another device during exam "
                f"(provider={provider}, device_id={device_id})"
            ),
        )

    # Integrity commands lock Contest before User. Write Contest FK audits only
    # after the password User transaction releases its lock; retain this decision.
    transaction.on_commit(write_conflict_audit)

    return contract_error_response(
        request, "active_exam_session_exists",
        "偵測到你有進行中的考試，請回到原本的裝置完成考試後再登入。",
        status=status.HTTP_409_CONFLICT,
        details={"active_exam": {
            "contest_id": str(contest.id), "contest_name": contest.name,
            "participant_id": conflict.participant.id,
            "exam_status": conflict.participant.exam_status,
        }},
    )
