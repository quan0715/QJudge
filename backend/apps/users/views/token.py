"""Token lifecycle user views."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from ..authentication import clear_jwt_cookies, get_refresh_token_from_cookie, set_jwt_cookies
from ..serializers import ResolveConflictSerializer, TokenRefreshSerializer
from .common import (
    SchemaAPIView,
    consume_conflict_payload_or_error,
    perform_takeover_lock,
)

User = get_user_model()


@method_decorator(ensure_csrf_cookie, name="dispatch")
class TokenRefreshView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = TokenRefreshSerializer

    def post(self, request):
        refresh_token = get_refresh_token_from_cookie(request) or request.data.get("refresh")
        if not refresh_token:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "MISSING_TOKEN",
                        "message": "缺少 refresh token",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)
            tokens = {"access": access_token, "refresh": str(refresh)}
            response = Response(
                {
                    "success": True,
                    "data": {"access_token": access_token},
                }
            )
            set_jwt_cookies(response, tokens)
            return response
        except Exception:
            response = Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVALID_TOKEN",
                        "message": "Refresh token 無效或已過期",
                    },
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_jwt_cookies(response)
            return response


class ResolveConflictView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = ResolveConflictSerializer

    def post(self, request):
        serializer = ResolveConflictSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload, error_response = consume_conflict_payload_or_error(
            serializer.validated_data["conflict_token"]
        )
        if error_response is not None:
            return error_response
        return perform_takeover_lock(user_model=User, request=request, payload=payload)


class LogoutView(SchemaAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer

    def post(self, request):
        try:
            refresh_token = get_refresh_token_from_cookie(request) or request.data.get("refresh")
            if refresh_token:
                try:
                    RefreshToken(refresh_token).blacklist()
                except Exception:
                    pass
            else:
                for token in OutstandingToken.objects.filter(user=request.user):
                    try:
                        BlacklistedToken.objects.get_or_create(token=token)
                    except Exception:
                        pass
        finally:
            response = Response({"success": True, "message": "登出成功"})
            clear_jwt_cookies(response)
            return response


__all__ = ["TokenRefreshView", "LogoutView", "ResolveConflictView"]
