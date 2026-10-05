"""Anonymous password recovery endpoints using the users-domain contract."""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from apps.core.api.envelope import contract_error_response, contract_validation_error_response
from ..authentication import clear_jwt_cookies
from ..password_reset import complete_password_reset, InvalidResetToken, reset_enabled
from ..tasks import deliver_password_reset
from ..throttles import PasswordRecoveryThrottle
from .common import SchemaAPIView


class PasswordResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254, trim_whitespace=True)


class PasswordResetCompleteSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64, write_only=True)
    token = serializers.CharField(max_length=128, write_only=True)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    password_confirm = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': '兩次密碼不一致 / Passwords do not match.'})
        return attrs


class PasswordResetRequestView(SchemaAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordRecoveryThrottle]
    serializer_class = PasswordResetRequestSerializer
    limit_identifier = True

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return contract_validation_error_response(request, '資料驗證失敗', serializer.errors)
        if reset_enabled():
            try:
                # No account lookup in the request: known and unknown accounts
                # enqueue exactly the same work and receive the same response.
                deliver_password_reset.delay(serializer.validated_data['identifier'])
            except Exception:
                return contract_error_response(request, 'mail_unavailable', '暫時無法處理申請，請稍後再試。', status=503)
        return Response(None, status=202)


class PasswordResetCompleteView(SchemaAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordRecoveryThrottle]
    serializer_class = PasswordResetCompleteSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return contract_validation_error_response(request, '資料驗證失敗', serializer.errors)
        data = serializer.validated_data
        try:
            complete_password_reset(data['uid'], data['token'], data['password'])
        except InvalidResetToken:
            return contract_error_response(request, 'invalid_reset_token', '連結無效或已過期，請重新申請。', status=400)
        except DjangoValidationError as exc:
            return contract_validation_error_response(request, '密碼不符合要求', {'password': exc.messages})
        response = Response(None)
        clear_jwt_cookies(response)
        response['Cache-Control'] = 'no-store'
        return response
