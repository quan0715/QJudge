"""Current-user account views."""

from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.core.api.envelope import contract_error_response, contract_validation_error_response

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
        return Response(serializer.data)

    def patch(self, request):
        """Update current user profile."""
        user = request.user
        mutable_fields = {"username", "email"}
        requested_mutable_fields = mutable_fields.intersection(request.data.keys())

        if user.auth_provider != 'email' and requested_mutable_fields:
            return contract_error_response(request, 'ACCOUNT_FIELDS_LOCKED', 'SSO/OAuth 帳號無法修改使用者名稱或電子郵件，僅可編輯顯示名稱', status=status.HTTP_403_FORBIDDEN)

        if not requested_mutable_fields:
            serializer = UserSerializer(user)
            return Response(serializer.data)

        serializer = CurrentUserUpdateSerializer(user, data=request.data, partial=True)

        if not serializer.is_valid():
            return contract_validation_error_response(request, '更新資料驗證失敗', serializer.errors)

        serializer.save()
        refreshed_user = User.objects.get(pk=user.pk)
        response_serializer = UserSerializer(refreshed_user)

        return Response(response_serializer.data)


__all__ = ["CurrentUserView"]
