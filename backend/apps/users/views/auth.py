"""Authentication-related user views."""

from __future__ import annotations

import logging
import secrets

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django_ratelimit.decorators import ratelimit
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..serializers import LoginSerializer, OAuthCallbackSerializer, RegisterSerializer
from ..services import EmailAuthService, JWTService, NYCUOAuthService
from .common import (
    SchemaAPIView,
    build_conflict_response,
    token_cookie_response,
    validation_error_response,
)

logger = logging.getLogger(__name__)


@method_decorator(ratelimit(key="ip", rate="5/m", method="POST", block=True), name="post")
@method_decorator(csrf_exempt, name="dispatch")
class RegisterView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response("註冊資料驗證失敗", serializer.errors)

        try:
            user = serializer.save()
            verification_url = EmailAuthService.send_verification_email(user)
            tokens = JWTService.generate_tokens(user)
            return token_cookie_response(
                user,
                tokens,
                status_code=status.HTTP_201_CREATED,
                message="註冊成功,請檢查您的Email以驗證帳號",
                extra_data={"verification_url": verification_url},
            )
        except Exception as exc:
            logger.exception("Registration failed: %s", exc)
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "REGISTRATION_FAILED",
                        "message": "註冊失敗，請稍後再試",
                    },
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@method_decorator(ratelimit(key="ip", rate="10/m", method="POST", block=True), name="post")
@method_decorator(csrf_exempt, name="dispatch")
@method_decorator(ensure_csrf_cookie, name="dispatch")
class LoginView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response("登入資料驗證失敗", serializer.errors)

        user = EmailAuthService.login(
            serializer.validated_data["email"],
            serializer.validated_data["password"],
        )
        if not user:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "AUTH_001",
                        "message": "Email 或密碼錯誤",
                    },
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        conflict_response = build_conflict_response(user, request, provider="email")
        if conflict_response is not None:
            return conflict_response

        tokens = JWTService.generate_tokens(user)
        return token_cookie_response(user, tokens)


@method_decorator(csrf_exempt, name="dispatch")
class DevTokenView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = serializers.Serializer

    def post(self, request):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if not settings.DEBUG:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get("role", "student")
        want_superuser = bool(request.data.get("superuser", False))
        if role not in ["student", "teacher", "admin"]:
            return Response(
                {"detail": "Invalid role. Use student, teacher, or admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = request.data.get("email") or f"dev-{role}@local.test"
        username = request.data.get("username") or f"dev_{role}"
        password = request.data.get("password")

        def ensure_unique_username(base: str) -> str:
            if not User.objects.filter(username=base).exists():
                return base
            suffix = 1
            while User.objects.filter(username=f"{base}_{suffix}").exists():
                suffix += 1
            return f"{base}_{suffix}"

        user = User.objects.filter(email=email).first()
        created = False
        if not user:
            created = True
            user = User(
                username=ensure_unique_username(username),
                email=email,
                auth_provider="email",
                email_verified=True,
                is_active=True,
            )

        user.role = role
        user.is_staff = role == "admin"
        user.is_superuser = role == "admin" and want_superuser

        if created or password:
            if not password:
                password = secrets.token_urlsafe(12)
            user.set_password(password)

        if created:
            user.save()
        else:
            update_fields = ["role", "is_staff", "is_superuser"]
            if password:
                update_fields.append("password")
            user.save(update_fields=update_fields)

        tokens = JWTService.generate_tokens(user)
        extra_data = {"dev_password": password} if created and password else None
        return token_cookie_response(user, tokens, extra_data=extra_data)


class NYCUOAuthLoginView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = serializers.Serializer

    def get(self, request):
        redirect_uri = f"{settings.FRONTEND_URL}/auth/nycu/callback"
        state = secrets.token_urlsafe(16)
        auth_url = NYCUOAuthService.get_authorization_url(redirect_uri, state)
        return Response(
            {
                "success": True,
                "data": {"authorization_url": auth_url},
            }
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
@method_decorator(csrf_exempt, name="dispatch")
class NYCUOAuthCallbackView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = OAuthCallbackSerializer

    def post(self, request):
        serializer = OAuthCallbackSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response("OAuth 參數驗證失敗", serializer.errors)

        try:
            oauth_data = NYCUOAuthService.exchange_code(
                code=serializer.validated_data["code"],
                redirect_uri=serializer.validated_data["redirect_uri"],
            )
            user = NYCUOAuthService.get_or_create_user(oauth_data)
            conflict_response = build_conflict_response(user, request, provider="oauth")
            if conflict_response is not None:
                return conflict_response

            tokens = JWTService.generate_tokens(user)
            return token_cookie_response(user, tokens)
        except Exception as exc:
            logger.exception("NYCU OAuth callback failed: %s", exc)
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "AUTH_003",
                        "message": "NYCU OAuth 授權失敗",
                    },
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )


__all__ = [
    "SchemaAPIView",
    "RegisterView",
    "LoginView",
    "DevTokenView",
    "NYCUOAuthLoginView",
    "NYCUOAuthCallbackView",
]
