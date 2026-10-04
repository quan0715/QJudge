"""Authentication-related user views."""

from __future__ import annotations

import logging
import secrets

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django_ratelimit.decorators import ratelimit
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from apps.core.api.envelope import contract_error_response

from rest_framework_simplejwt.tokens import AccessToken

from ..auth.account_linking import link_qauth_identity
from ..auth.options import get_auth_options, is_password_auth_enabled
from ..auth.providers.base import OAuthProviderConfigurationError
from ..auth.provider_registry import get_oauth_service
from ..serializers import LoginSerializer, OAuthCallbackSerializer, RegisterSerializer
from ..services import (
    EmailAuthService,
    JWTService,
)
from .common import (
    SchemaAPIView,
    build_active_exam_login_block_response,
    password_auth_disabled_response,
    record_login,
    token_cookie_response,
    validation_error_response,
)

logger = logging.getLogger(__name__)


def _login_ip_rate(group, request):
    # Allow loadtest to disable login IP ratelimit to avoid data pollution.
    if getattr(settings, "LOADTEST_DISABLE_LOGIN_RATELIMIT", False):
        return None
    return "10/m"


@method_decorator(ratelimit(key="ip", rate="5/m", method="POST", block=True), name="post")
@method_decorator(ensure_csrf_cookie, name="dispatch")
@method_decorator(csrf_exempt, name="dispatch")
class RegisterView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def post(self, request):
        if not is_password_auth_enabled():
            return password_auth_disabled_response(request)

        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(request, "註冊資料驗證失敗", serializer.errors)

        try:
            user = serializer.save()
            tokens = JWTService.generate_tokens(user)
            return token_cookie_response(
                user,
                tokens,
                status_code=status.HTTP_201_CREATED,
                message="註冊成功",
            )
        except Exception as exc:
            logger.exception("Registration failed: %s", exc)
            return contract_error_response(request, 'REGISTRATION_FAILED', '註冊失敗，請稍後再試', status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _password_provider_login(request):
    if not is_password_auth_enabled():
        return password_auth_disabled_response(request)

    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(request, "登入資料驗證失敗", serializer.errors)

    user = EmailAuthService.login(
        serializer.validated_data["identifier"],
        serializer.validated_data["password"],
    )
    if not user:
        return contract_error_response(request, 'AUTH_001', '帳號或密碼錯誤', status=status.HTTP_401_UNAUTHORIZED)

    conflict_response = build_active_exam_login_block_response(user, request, provider="password")
    if conflict_response is not None:
        return conflict_response

    tokens = JWTService.generate_tokens(user)
    access_jti = str(AccessToken(tokens["access"]).get("jti", ""))
    record_login(user, request, login_method="password", jti=access_jti)
    return token_cookie_response(user, tokens)


class AuthOptionsView(SchemaAPIView):
    """GET /api/v1/auth/providers → return public login provider metadata."""

    permission_classes = [AllowAny]
    serializer_class = serializers.Serializer

    def get(self, request):
        return Response(get_auth_options())


@extend_schema(exclude=True)
@method_decorator(csrf_exempt, name="dispatch")
class DevTokenView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = serializers.Serializer

    def post(self, request):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if not settings.DEBUG:
            from rest_framework.exceptions import NotFound
            raise NotFound()

        role = request.data.get("role", "student")
        want_superuser = bool(request.data.get("superuser", False))
        if role not in ["student", "teacher", "admin"]:
            return contract_error_response(request, "invalid_role", "Invalid role. Use student, teacher, or admin.", status=400)

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


# ---------------------------------------------------------------------------
# Provider login and OAuth callback views
# ---------------------------------------------------------------------------

@method_decorator(ratelimit(key="ip", rate=_login_ip_rate, method="POST", block=True), name="post")
@method_decorator(csrf_exempt, name="dispatch")
@method_decorator(ensure_csrf_cookie, name="dispatch")
class ProviderLoginView(SchemaAPIView):
    """GET/POST /api/v1/auth/login/<provider> dispatches by provider kind."""

    permission_classes = [AllowAny]
    serializer_class = serializers.Serializer

    @extend_schema(request=None)
    def get(self, request, provider: str):
        if provider == "password":
            return contract_error_response(request, 'PASSWORD_PROVIDER_REQUIRES_POST', 'password provider login requires POST credentials', status=status.HTTP_405_METHOD_NOT_ALLOWED)

        service = get_oauth_service(provider)
        if service is None:
            return contract_error_response(request, 'UNKNOWN_PROVIDER', f'Unknown login provider: {provider}', status=status.HTTP_400_BAD_REQUEST)
        redirect_uri = f"{settings.FRONTEND_URL}/auth/{provider}/callback"
        state = secrets.token_urlsafe(16)
        try:
            auth_url = service.get_authorization_url(redirect_uri, state)
        except OAuthProviderConfigurationError:
            logger.error("OAuth provider is not configured provider=%s", provider)
            return contract_error_response(request, 'OAUTH_PROVIDER_NOT_CONFIGURED', f'OAuth provider is not configured: {provider}', status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'authorization_url': auth_url})

    @extend_schema(request=LoginSerializer)
    def post(self, request, provider: str):
        if provider == "password":
            return _password_provider_login(request)

        service = get_oauth_service(provider)
        if service is None:
            return contract_error_response(request, 'UNKNOWN_PROVIDER', f'Unknown login provider: {provider}', status=status.HTTP_400_BAD_REQUEST)

        return contract_error_response(request, 'OAUTH_PROVIDER_REQUIRES_REDIRECT', 'OAuth providers must start with GET /api/v1/auth/login/{provider}', status=status.HTTP_405_METHOD_NOT_ALLOWED)


@method_decorator(ensure_csrf_cookie, name="dispatch")
@method_decorator(csrf_exempt, name="dispatch")
class OAuthCallbackView(SchemaAPIView):
    """POST /api/v1/auth/callback/<provider> → exchange code, return JWT."""

    permission_classes = [AllowAny]
    serializer_class = OAuthCallbackSerializer

    def post(self, request, provider: str):
        service = get_oauth_service(provider)
        if service is None:
            return contract_error_response(request, 'UNKNOWN_PROVIDER', f'Unknown OAuth provider: {provider}', status=status.HTTP_400_BAD_REQUEST)

        serializer = OAuthCallbackSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error_response(request, "OAuth 參數驗證失敗", serializer.errors)

        try:
            oauth_data = service.exchange_code(
                code=serializer.validated_data["code"],
                redirect_uri=serializer.validated_data["redirect_uri"],
            )
            user = link_qauth_identity(
                service.normalize_identity(oauth_data),
                service.provider_token_set(oauth_data),
            )
            conflict_response = build_active_exam_login_block_response(user, request, provider="oauth")
            if conflict_response is not None:
                return conflict_response

            tokens = JWTService.generate_tokens(user)
            access_jti = str(AccessToken(tokens["access"]).get("jti", ""))
            record_login(user, request, login_method=provider, jti=access_jti)
            return token_cookie_response(user, tokens)
        except OAuthProviderConfigurationError:
            logger.error("OAuth provider is not configured provider=%s", provider)
            return contract_error_response(request, 'OAUTH_PROVIDER_NOT_CONFIGURED', f'OAuth provider is not configured: {provider}', status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as exc:
            logger.exception("%s OAuth callback failed: %s", provider, exc)
            return contract_error_response(request, 'AUTH_003', f'{provider} OAuth 授權失敗', status=status.HTTP_401_UNAUTHORIZED)


__all__ = [
    "SchemaAPIView",
    "RegisterView",
    "ProviderLoginView",
    "AuthOptionsView",
    "DevTokenView",
    "OAuthCallbackView",
]
