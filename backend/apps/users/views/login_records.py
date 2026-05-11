"""Login records and device-management views."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..serializers import UserLoginRecordSerializer
from .common import SchemaAPIView


class LoginRecordsView(SchemaAPIView):
    """GET /api/v1/auth/me/login-records — list recent login records."""
    permission_classes = [IsAuthenticated]
    serializer_class = UserLoginRecordSerializer

    def get(self, request):
        cutoff = timezone.now() - timedelta(days=30)
        records = request.user.login_records.filter(created_at__gte=cutoff)[:50]
        return Response({
            'success': True,
            'data': UserLoginRecordSerializer(records, many=True).data,
        })


class LogoutOtherDevicesView(SchemaAPIView):
    """POST /api/v1/auth/me/logout-other-devices — blacklist all other tokens."""
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer

    def post(self, request):
        from apps.contests.services.anti_cheat_session import get_token_jti, get_refresh_jti, blacklist_other_tokens

        jti = get_token_jti(request)
        if not jti:
            return Response(
                {'success': False, 'error': {'code': 'NO_JTI', 'message': 'Cannot identify current token.'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        count = blacklist_other_tokens(request.user, access_jti=jti, refresh_jti=get_refresh_jti(request))

        # Mark other login records as not current
        from ..models import UserLoginRecord
        UserLoginRecord.objects.filter(user=request.user, is_current=True).exclude(jti=jti).update(is_current=False)

        return Response({
            'success': True,
            'data': {'blacklisted_count': count},
            'message': f'已登出其他 {count} 個裝置',
        })


__all__ = ["LoginRecordsView", "LogoutOtherDevicesView"]
