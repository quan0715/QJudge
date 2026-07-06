"""Current-user account views."""

from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..serializers import CurrentUserUpdateSerializer, UserSerializer
from .common import SchemaAPIView

User = get_user_model()


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CurrentUserView(SchemaAPIView):
    """
    Get current authenticated user information.

    GET /api/v1/users/me
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response({
            'success': True,
            'data': serializer.data
        })

    def patch(self, request):
        """Update current user profile."""
        user = request.user
        mutable_fields = {"username", "email"}
        requested_mutable_fields = mutable_fields.intersection(request.data.keys())

        if user.auth_provider != 'email' and requested_mutable_fields:
            return Response({
                'success': False,
                'error': {
                    'code': 'ACCOUNT_FIELDS_LOCKED',
                    'message': 'SSO/OAuth 帳號無法修改使用者名稱或電子郵件，僅可編輯顯示名稱'
                }
            }, status=status.HTTP_403_FORBIDDEN)

        if not requested_mutable_fields:
            serializer = UserSerializer(user)
            return Response({
                'success': True,
                'data': serializer.data,
                'message': '無更新欄位'
            })

        serializer = CurrentUserUpdateSerializer(user, data=request.data, partial=True)

        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '更新資料驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        refreshed_user = User.objects.get(pk=user.pk)
        response_serializer = UserSerializer(refreshed_user)

        return Response({
            'success': True,
            'data': response_serializer.data,
            'message': '個人資料已更新'
        })


__all__ = ["CurrentUserView"]
