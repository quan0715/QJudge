"""Password management views."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from ..serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
)
from ..services import EmailAuthService
from .common import SchemaAPIView

User = get_user_model()


class ChangePasswordView(SchemaAPIView):
    """
    Change password for current user.

    POST /api/v1/auth/change-password

    Requires current password verification.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        user = request.user

        # Only email users can change password
        if user.auth_provider != 'email':
            return Response({
                'success': False,
                'error': {
                    'code': 'OAUTH_USER',
                    'message': 'OAuth 使用者無法變更密碼，請透過原認證方式管理'
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = ChangePasswordSerializer(data=request.data)

        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': '密碼驗證失敗',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        # Verify current password
        if not user.check_password(serializer.validated_data['current_password']):
            return Response({
                'success': False,
                'error': {
                    'code': 'WRONG_PASSWORD',
                    'message': '目前密碼錯誤'
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        # Set new password
        user.set_password(serializer.validated_data['new_password'])
        user.save()

        return Response({
            'success': True,
            'message': '密碼已成功變更'
        })


@method_decorator(ratelimit(key='ip', rate='10/h', method='POST', block=True), name='post')
class ForgotPasswordView(SchemaAPIView):
    """
    Request a password reset token.

    POST /api/v1/auth/forgot-password
    """

    permission_classes = [AllowAny]
    serializer_class = ForgotPasswordSerializer

    def post(self, request):
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


__all__ = ["ChangePasswordView", "ForgotPasswordView", "ResetPasswordView"]
