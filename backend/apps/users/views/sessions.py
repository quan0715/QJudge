"""Auth session and device-management views."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.core.api.envelope import contract_error_response

from ..serializers import UserLoginRecordSerializer
from .common import SchemaAPIView


class AuthSessionListView(SchemaAPIView):
    """GET /api/v1/auth/sessions — list recent login sessions."""
    permission_classes = [IsAuthenticated]
    serializer_class = UserLoginRecordSerializer

    def get(self, request):
        cutoff = timezone.now() - timedelta(days=30)
        records = request.user.login_records.filter(created_at__gte=cutoff)[:50]
        return Response(UserLoginRecordSerializer(records, many=True).data)


class LogoutOtherSessionsView(SchemaAPIView):
    """POST /api/v1/auth/sessions/logout-others — blacklist all other sessions."""
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer

    def post(self, request):
        from apps.contests.services.anti_cheat_session import get_token_jti, get_refresh_jti, blacklist_other_tokens

        jti = get_token_jti(request)
        if not jti:
            return contract_error_response(request, 'NO_JTI', 'Cannot identify current token.', status=status.HTTP_400_BAD_REQUEST)

        count = blacklist_other_tokens(request.user, access_jti=jti, refresh_jti=get_refresh_jti(request))

        # Mark other login records as not current
        from ..models import UserLoginRecord
        UserLoginRecord.objects.filter(user=request.user, is_current=True).exclude(jti=jti).update(is_current=False)

        return Response({'blacklisted_count': count})


__all__ = ["AuthSessionListView", "LogoutOtherSessionsView"]
