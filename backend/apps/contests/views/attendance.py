"""Attendance QR endpoints for contests."""
from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Contest
from ..permissions import can_manage_contest
from ..services.attendance import (
    ATTENDANCE_EVENT_TYPES,
    ATTENDANCE_REFRESH_SECONDS,
    ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
    build_attendance_error_payload,
    build_attendance_qr_value,
    create_attendance_credential,
    create_attendance_event,
    normalize_attendance_error_code,
    reset_participant_attendance_records,
    validate_attendance_manual_code,
    validate_attendance_token,
)


class AttendanceEventSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("student_self_scan", "teacher_assisted"))
    purpose = serializers.ChoiceField(choices=("check_in", "check_out"))
    manual_code = serializers.CharField(required=False, allow_blank=True, max_length=16)
    token = serializers.CharField(required=False, allow_blank=True)
    user_id = serializers.IntegerField(required=False, min_value=1)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200)
    client_observed_at_ms = serializers.IntegerField(required=False, min_value=0)
    device_kind = serializers.CharField(required=False, allow_blank=True, max_length=32)

    def validate(self, attrs):
        mode = attrs.get("mode")
        if mode == "student_self_scan":
            if attrs.get("user_id"):
                raise serializers.ValidationError({"user_id": "Forbidden for student self scan."})
            has_token = bool(attrs.get("token"))
            has_manual_code = bool(str(attrs.get("manual_code") or "").strip())
            if has_token and has_manual_code:
                raise serializers.ValidationError({
                    "manual_code": "Use either QR token or manual code, not both.",
                })
            if not has_token and not has_manual_code:
                raise serializers.ValidationError({"token": "Attendance token or manual code is required."})
        if mode == "teacher_assisted":
            if attrs.get("token") or attrs.get("manual_code"):
                raise serializers.ValidationError({"token": "Forbidden for teacher-assisted attendance."})
            if not attrs.get("user_id"):
                raise serializers.ValidationError({"user_id": "Participant user id is required."})
            if not str(attrs.get("reason") or "").strip():
                raise serializers.ValidationError({"reason": "Reason is required."})
        return attrs


class AttendanceValidateSerializer(serializers.Serializer):
    purpose = serializers.ChoiceField(choices=("check_in", "check_out"))
    token = serializers.CharField(required=False, allow_blank=True)
    manual_code = serializers.CharField(required=False, allow_blank=True, max_length=16)

    def validate(self, attrs):
        has_token = bool(attrs.get("token"))
        has_manual_code = bool(str(attrs.get("manual_code") or "").strip())
        if has_token and has_manual_code:
            raise serializers.ValidationError({
                "manual_code": "Use either QR token or manual code, not both.",
            })
        if not has_token and not has_manual_code:
            raise serializers.ValidationError({"token": "Attendance token or manual code is required."})
        return attrs


class AttendanceResetSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(min_value=1)


def _attendance_disabled_response(contest: Contest) -> Response | None:
    if contest.attendance_check_enabled:
        return None
    return Response(
        build_attendance_error_payload("attendance_not_enabled"),
        status=status.HTTP_400_BAD_REQUEST,
    )


def _value_error_response(exc: ValueError, *, http_status: int = status.HTTP_400_BAD_REQUEST) -> Response:
    return Response(
        build_attendance_error_payload(normalize_attendance_error_code(exc)),
        status=http_status,
    )


class AttendanceMixin:
    @action(
        detail=True,
        methods=["get"],
        permission_classes=[permissions.IsAuthenticated],
        url_path="attendance/qr-token",
    )
    def attendance_qr_token(self, request, pk=None):
        contest: Contest = self.get_object()
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )
        disabled = _attendance_disabled_response(contest)
        if disabled is not None:
            return disabled
        purpose = request.query_params.get("purpose")
        if purpose not in ATTENDANCE_EVENT_TYPES:
            return Response(
                build_attendance_error_payload("invalid_attendance_purpose"),
                status=status.HTTP_400_BAD_REQUEST,
            )

        credential = create_attendance_credential(contest, purpose)
        return Response(
            {
                "purpose": purpose,
                "token": credential["token"],
                "manual_code": credential["manual_code"],
                "qr_value": build_attendance_qr_value(purpose, credential["token"]),
                "refresh_after_seconds": ATTENDANCE_REFRESH_SECONDS,
                "expires_in_seconds": ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
                "expires_at": (
                    timezone.now() + timezone.timedelta(seconds=ATTENDANCE_TOKEN_MAX_AGE_SECONDS)
                ).isoformat(),
            }
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated],
        url_path="attendance/validate",
    )
    def attendance_validate(self, request, pk=None):
        contest: Contest = self.get_object()
        disabled = _attendance_disabled_response(contest)
        if disabled is not None:
            return disabled

        serializer = AttendanceValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purpose = serializer.validated_data["purpose"]
        token = serializer.validated_data.get("token") or ""
        manual_code = str(serializer.validated_data.get("manual_code") or "").strip()

        try:
            if manual_code:
                validate_attendance_manual_code(contest, purpose, manual_code)
                credential_source = "manual_code"
            else:
                validate_attendance_token(contest, purpose, token)
                credential_source = "qr_token"
        except ValueError as exc:
            return _value_error_response(exc)

        return Response({
            "valid": True,
            "purpose": purpose,
            "credential_source": credential_source,
        })

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated],
        url_path="attendance/events",
    )
    def attendance_events(self, request, pk=None):
        contest: Contest = self.get_object()
        disabled = _attendance_disabled_response(contest)
        if disabled is not None:
            return disabled

        serializer = AttendanceEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = create_attendance_event(
                contest=contest,
                actor=request.user,
                data=serializer.validated_data,
                ensure_participant=self._ensure_classroom_bound_participant,
            )
        except ValueError as exc:
            code = normalize_attendance_error_code(exc)
            http_status = (
                status.HTTP_403_FORBIDDEN
                if code == "attendance_teacher_permission_required"
                else status.HTTP_400_BAD_REQUEST
            )
            return _value_error_response(exc, http_status=http_status)

        error_response = result.get("error_response")
        if error_response is not None:
            return error_response
        if "error_code" in result:
            return Response(
                build_attendance_error_payload(result["error_code"]),
                status=status.HTTP_409_CONFLICT,
            )
        return Response(result["payload"], status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated],
        url_path="attendance/reset",
    )
    def attendance_reset(self, request, pk=None):
        contest: Contest = self.get_object()
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = AttendanceResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = reset_participant_attendance_records(
                contest,
                serializer.validated_data["user_id"],
            )
        except ValueError as exc:
            return _value_error_response(exc)
        return Response(result)
