"""Token lifecycle user views."""

from __future__ import annotations

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from apps.core.api.envelope import contract_error_response
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from ..authentication import clear_jwt_cookies, get_refresh_token_from_cookie, set_jwt_cookies
from ..serializers import TokenRefreshSerializer
from .common import (
    SchemaAPIView,
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class TokenRefreshView(SchemaAPIView):
    permission_classes = [AllowAny]
    serializer_class = TokenRefreshSerializer

    def post(self, request):
        refresh_token = get_refresh_token_from_cookie(request) or request.data.get("refresh")
        if not refresh_token:
            return contract_error_response(request, 'MISSING_TOKEN', '缺少 refresh token', status=status.HTTP_400_BAD_REQUEST)

        try:
            refresh = RefreshToken(refresh_token)
            access = refresh.access_token
            access['session_jti'] = str(refresh['jti'])
            access_token = str(access)
            tokens = {"access": access_token, "refresh": str(refresh)}
            response = Response({'access_token': access_token})
            set_jwt_cookies(response, tokens)
            return response
        except Exception:
            response = contract_error_response(request, 'INVALID_TOKEN', 'Refresh token 無效或已過期', status=status.HTTP_401_UNAUTHORIZED)
            clear_jwt_cookies(response)
            return response


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
            response = Response(None)
            clear_jwt_cookies(response)
            return response


__all__ = ["TokenRefreshView", "LogoutView"]
