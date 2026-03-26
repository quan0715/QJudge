"""Teacher activation invite views."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from ..permissions import IsSuperAdmin
from ..serializers import (
    TeacherActivationConsumeSerializer,
    TeacherActivationInviteCreateSerializer,
    TeacherActivationInviteSerializer,
    UserSerializer,
)
from ..services import EmailAuthService
from .common import SchemaAPIView

User = get_user_model()


class TeacherActivationInviteIssueView(SchemaAPIView):
    """Admin-only endpoint for issuing teacher activation links."""

    permission_classes = [IsSuperAdmin]
    serializer_class = TeacherActivationInviteCreateSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "邀請資料驗證失敗",
                        "details": serializer.errors,
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            invite, activation_url = EmailAuthService.issue_teacher_activation_invite(
                email=serializer.validated_data["email"],
                created_by=request.user,
            )
        except ValueError as exc:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVITE_NOT_ALLOWED",
                        "message": str(exc),
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = TeacherActivationInviteSerializer(invite).data
        payload.update(
            {
                "activation_url": activation_url,
                "existing_user": (
                    {
                        "id": invite.target_user.id,
                        "username": invite.target_user.username,
                        "role": invite.target_user.role,
                    }
                    if invite.target_user
                    else None
                ),
            }
        )
        return Response(
            {
                "success": True,
                "data": payload,
                "message": f"已產生 {invite.email} 的教師開通連結",
            },
            status=status.HTTP_201_CREATED,
        )


class TeacherActivationInvitePreviewView(SchemaAPIView):
    """Public endpoint for checking invite status before login/consume."""

    permission_classes = [AllowAny]
    serializer_class = serializers.Serializer

    def get(self, request):
        token = (request.query_params.get("token") or "").strip()
        if not token:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "TOKEN_REQUIRED",
                        "message": "缺少開通 token",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        invite = EmailAuthService.get_teacher_activation_invite_by_token(token)
        if invite is None:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVITE_NOT_FOUND",
                        "message": "找不到對應的教師開通邀請",
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user if request.user.is_authenticated else None
        invite_data = TeacherActivationInviteSerializer(invite).data
        is_pending = invite_data["status"] == "pending"
        email_matches = bool(
            user and user.email and user.email.lower() == invite.email.lower()
        )
        invite_data.update(
            {
                "requires_login": user is None,
                "email_matches_current_user": email_matches,
                "current_user_email": user.email if user else None,
                "current_user_role": user.role if user else None,
                "can_consume": bool(user and is_pending and email_matches),
            }
        )
        return Response({"success": True, "data": invite_data})


class TeacherActivationInviteConsumeView(SchemaAPIView):
    """Authenticated endpoint that upgrades a matching user to teacher."""

    permission_classes = [IsAuthenticated]
    serializer_class = TeacherActivationConsumeSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "開通資料驗證失敗",
                        "details": serializer.errors,
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data["token"]
        invite = EmailAuthService.get_teacher_activation_invite_by_token(token)
        if invite is None:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVITE_NOT_FOUND",
                        "message": "找不到對應的教師開通邀請",
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if invite.consumed_at:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVITE_ALREADY_CONSUMED",
                        "message": "這個教師開通連結已經使用過了",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if invite.expires_at <= timezone.now():
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVITE_EXPIRED",
                        "message": "這個教師開通連結已過期",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        current_email = (request.user.email or "").lower()
        if current_email != invite.email.lower():
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVITE_EMAIL_MISMATCH",
                        "message": f"請使用 {invite.email} 登入後再開通教師權限",
                    },
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            locked_invite = (
                type(invite)
                .objects.select_for_update()
                .get(pk=invite.pk)
            )
            if locked_invite.consumed_at:
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": "INVITE_ALREADY_CONSUMED",
                            "message": "這個教師開通連結已經使用過了",
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if locked_invite.expires_at <= timezone.now():
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": "INVITE_EXPIRED",
                            "message": "這個教師開通連結已過期",
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.select_for_update().get(pk=request.user.pk)
            if user.role == "student":
                user.role = "teacher"
                user.save(update_fields=["role", "updated_at"])

            locked_invite.target_user = user
            locked_invite.consumed_by = user
            locked_invite.consumed_at = timezone.now()
            locked_invite.save(update_fields=["target_user", "consumed_by", "consumed_at", "updated_at"])

        user.refresh_from_db()
        return Response(
            {
                "success": True,
                "data": {
                    "user": UserSerializer(user).data,
                    "invite": TeacherActivationInviteSerializer(locked_invite).data,
                },
                "message": "教師權限已開通",
            }
        )


__all__ = [
    "TeacherActivationInviteIssueView",
    "TeacherActivationInvitePreviewView",
    "TeacherActivationInviteConsumeView",
]
