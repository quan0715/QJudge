"""Password management views."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..serializers import (
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
)
from ..auth.options import is_password_auth_enabled
from ..services import EmailAuthService
from .common import SchemaAPIView, password_auth_disabled_response

User = get_user_model()


@method_decorator(ratelimit(key='ip', rate='10/h', method='POST', block=True), name='post')
class ForgotPasswordView(SchemaAPIView):
    """
    Request a password reset token.

    POST /api/v1/auth/forgot-password
    """

    permission_classes = [AllowAny]
    serializer_class = ForgotPasswordSerializer

    def post(self, request):
        if not is_password_auth_enabled():
            return password_auth_disabled_response()

        serializer = ForgotPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '密碼重設請求驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        user = User.objects.filter(
            email=email,
            auth_provider='email',
            is_active=True,
        ).first()

        reset_url = None
        if user:
            reset_url = EmailAuthService.issue_password_reset(user)

        response_data = {
            'success': True,
            'message': '若此帳號可重設密碼，已寄送重設說明至信箱'
        }
        if settings.DEBUG and reset_url:
            response_data['data'] = {'reset_url': reset_url}
        return Response(response_data)


@method_decorator(ratelimit(key='ip', rate='20/h', method='POST', block=True), name='post')
class ResetPasswordView(SchemaAPIView):
    """
    Reset password by token.

    POST /api/v1/auth/reset-password
    """

    permission_classes = [AllowAny]
    serializer_class = ResetPasswordSerializer

    def post(self, request):
        if not is_password_auth_enabled():
            return password_auth_disabled_response()

        serializer = ResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '密碼重設驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        token = serializer.validated_data['token']
        user = EmailAuthService.get_user_by_password_reset_token(token)
        if not user:
            return Response({
                'success': False,
                'error': {
                    'code': 'INVALID_RESET_TOKEN',
                    'message': '重設連結無效或已過期'
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['new_password'])
        user.password_reset_token = None
        user.password_reset_expires_at = None
        user.save(update_fields=['password', 'password_reset_token', 'password_reset_expires_at'])

        return Response({
            'success': True,
            'message': '密碼已重設完成'
        })


__all__ = ["ForgotPasswordView", "ResetPasswordView"]
