"""Scoped magic link lifecycle views."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import AccessToken

from apps.classrooms.models import Classroom, ClassroomMember
from apps.classrooms.serializers import ClassroomDetailSerializer
from apps.classrooms.services import on_member_joined

from ..permissions import IsSuperAdmin
from ..serializers import (
    MagicLinkIssueSerializer,
    MagicLinkRedeemSerializer,
    TeacherActivationInviteSerializer,
)
from ..services import EmailAuthService, JWTService
from .common import SchemaAPIView, record_login, token_cookie_response

User = get_user_model()
logger = logging.getLogger(__name__)


def _error_response(code: str, message: str, http_status: int, details: dict | None = None):
    error = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return Response({"success": False, "error": error}, status=http_status)


def _teacher_magic_link_payload(invite, request):
    user = request.user if request.user.is_authenticated else None
    invite_data = TeacherActivationInviteSerializer(invite).data
    is_pending = invite_data["status"] == "pending"
    invite_data.update(
        {
            "purpose": "teacher_activation",
            "requires_login": user is None,
            "current_user_email": user.email if user else None,
            "current_user_role": user.role if user else None,
            "can_redeem": bool(user and is_pending),
            "can_consume": bool(user and is_pending),
        }
    )
    return invite_data


def _classroom_magic_link_payload(classroom: Classroom, request):
    user = request.user if request.user.is_authenticated else None
    enabled = classroom.invite_code_enabled and not classroom.is_archived
    return {
        "purpose": "classroom_join",
        "status": "pending" if enabled else "revoked",
        "requires_login": user is None,
        "current_user_email": user.email if user else None,
        "current_user_role": user.role if user else None,
        "can_redeem": bool(user and enabled),
        "target": {
            "type": "classroom",
            "id": str(classroom.uuid),
            "name": classroom.name,
        },
    }


def _find_classroom_by_token(token: str):
    code = (token or "").strip().upper()
    if not code:
        return None
    return (
        Classroom.objects.select_related("owner")
        .prefetch_related("admins")
        .filter(invite_code=code, is_archived=False)
        .first()
    )


class MagicLinkIssueView(SchemaAPIView):
    """Issue a scoped magic link for an explicit purpose."""

    permission_classes = [IsAuthenticated]
    serializer_class = MagicLinkIssueSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return _error_response(
                "VALIDATION_ERROR",
                "Magic link request validation failed.",
                status.HTTP_400_BAD_REQUEST,
                serializer.errors,
            )

        purpose = serializer.validated_data.get("purpose", "teacher_activation")
        if purpose == "teacher_activation":
            return self._issue_teacher_activation(request)
        if purpose == "classroom_join":
            return self._issue_classroom_join(request, serializer.validated_data["classroom_id"])
        return _error_response(
            "UNSUPPORTED_MAGIC_LINK_PURPOSE",
            "Unsupported magic link purpose.",
            status.HTTP_400_BAD_REQUEST,
        )

    def _issue_teacher_activation(self, request):
        if not IsSuperAdmin().has_permission(request, self):
            return _error_response(
                "PERMISSION_DENIED",
                "只有超級管理員可以產生教師開通連結",
                status.HTTP_403_FORBIDDEN,
            )

        try:
            invite, magic_link_url = EmailAuthService.issue_teacher_activation_invite(
                created_by=request.user,
            )
        except ValueError as exc:
            logger.warning("Teacher activation magic link not allowed: %s", exc)
            return _error_response(
                "MAGIC_LINK_NOT_ISSUABLE",
                "Magic link cannot be issued for this purpose.",
                status.HTTP_400_BAD_REQUEST,
            )

        payload = TeacherActivationInviteSerializer(invite).data
        payload.update(
            {
                "purpose": "teacher_activation",
                "magic_link_url": magic_link_url,
                "activation_url": magic_link_url,
                "existing_user": None,
            }
        )
        return Response(
            {
                "success": True,
                "data": payload,
                "message": "已產生教師開通連結",
            },
            status=status.HTTP_201_CREATED,
        )

    def _issue_classroom_join(self, request, classroom_id):
        classroom = (
            Classroom.objects.select_related("owner")
            .prefetch_related("admins")
            .filter(uuid=classroom_id, is_archived=False)
            .first()
        )
        if classroom is None:
            return _error_response(
                "CLASSROOM_NOT_FOUND",
                "Classroom not found.",
                status.HTTP_404_NOT_FOUND,
            )
        if classroom.owner_id != request.user.id and not classroom.admins.filter(pk=request.user.pk).exists():
            return _error_response(
                "PERMISSION_DENIED",
                "Only classroom managers can issue classroom invite magic links.",
                status.HTTP_403_FORBIDDEN,
            )
        if not classroom.invite_code_enabled:
            return _error_response(
                "MAGIC_LINK_NOT_ISSUABLE",
                "Classroom invite links are disabled.",
                status.HTTP_400_BAD_REQUEST,
            )

        magic_link_url = EmailAuthService.build_magic_link_url(classroom.invite_code)
        return Response(
            {
                "success": True,
                "data": {
                    "purpose": "classroom_join",
                    "token": classroom.invite_code,
                    "magic_link_url": magic_link_url,
                    "target": {
                        "type": "classroom",
                        "id": str(classroom.uuid),
                        "name": classroom.name,
                    },
                },
                "message": "已產生教室邀請連結",
            },
            status=status.HTTP_200_OK,
        )


class MagicLinkInspectView(SchemaAPIView):
    """Inspect a magic link without redeeming it."""

    permission_classes = [AllowAny]
    serializer_class = serializers.Serializer

    def get(self, request, token: str):
        token = (token or "").strip()
        if not token:
            return _error_response(
                "TOKEN_REQUIRED",
                "Missing magic link token.",
                status.HTTP_400_BAD_REQUEST,
            )

        invite = EmailAuthService.get_teacher_activation_invite_by_token(token)
        if invite is not None:
            return Response({"success": True, "data": _teacher_magic_link_payload(invite, request)})

        classroom = _find_classroom_by_token(token)
        if classroom is not None:
            return Response({"success": True, "data": _classroom_magic_link_payload(classroom, request)})

        return _error_response(
            "MAGIC_LINK_NOT_FOUND",
            "Magic link not found.",
            status.HTTP_404_NOT_FOUND,
        )


class MagicLinkRedeemView(SchemaAPIView):
    """Redeem a scoped magic link."""

    permission_classes = [IsAuthenticated]
    serializer_class = MagicLinkRedeemSerializer

    def post(self, request, token: str):
        token = (token or "").strip()
        if not token:
            return _error_response(
                "TOKEN_REQUIRED",
                "Missing magic link token.",
                status.HTTP_400_BAD_REQUEST,
            )

        invite = EmailAuthService.get_teacher_activation_invite_by_token(token)
        if invite is not None:
            return self._redeem_teacher_activation(request, invite)

        classroom = _find_classroom_by_token(token)
        if classroom is not None:
            return self._redeem_classroom_join(request, classroom)

        return _error_response(
            "MAGIC_LINK_NOT_FOUND",
            "Magic link not found.",
            status.HTTP_404_NOT_FOUND,
        )

    def _redeem_teacher_activation(self, request, invite):
        if invite.consumed_at:
            return _error_response(
                "MAGIC_LINK_ALREADY_REDEEMED",
                "這個教師開通連結已經使用過了",
                status.HTTP_400_BAD_REQUEST,
            )
        if invite.expires_at <= timezone.now():
            return _error_response(
                "MAGIC_LINK_EXPIRED",
                "這個教師開通連結已過期",
                status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            locked_invite = type(invite).objects.select_for_update().get(pk=invite.pk)
            if locked_invite.consumed_at:
                return _error_response(
                    "MAGIC_LINK_ALREADY_REDEEMED",
                    "這個教師開通連結已經使用過了",
                    status.HTTP_400_BAD_REQUEST,
                )
            if locked_invite.expires_at <= timezone.now():
                return _error_response(
                    "MAGIC_LINK_EXPIRED",
                    "這個教師開通連結已過期",
                    status.HTTP_400_BAD_REQUEST,
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
        tokens = JWTService.generate_tokens(user)
        access_jti = str(AccessToken(tokens["access"]).get("jti", ""))
        record_login(user, request, login_method="teacher_activation", jti=access_jti)
        return token_cookie_response(
            user,
            tokens,
            message="教師權限已開通",
            extra_data={
                "magic_link": _teacher_magic_link_payload(locked_invite, request),
                "invite": TeacherActivationInviteSerializer(locked_invite).data,
            },
        )

    def _redeem_classroom_join(self, request, classroom: Classroom):
        if not classroom.invite_code_enabled:
            return _error_response(
                "MAGIC_LINK_REVOKED",
                "Classroom invite link is disabled.",
                status.HTTP_403_FORBIDDEN,
            )

        if classroom.owner_id == request.user.id or classroom.admins.filter(pk=request.user.pk).exists():
            return Response(
                ClassroomDetailSerializer(classroom, context={"request": request}).data,
                status=status.HTTP_200_OK,
            )

        _, created = ClassroomMember.objects.get_or_create(
            classroom=classroom,
            user=request.user,
            defaults={"role": "student"},
        )
        if created:
            on_member_joined(classroom, request.user)

        return Response(
            ClassroomDetailSerializer(classroom, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


__all__ = ["MagicLinkIssueView", "MagicLinkInspectView", "MagicLinkRedeemView"]
