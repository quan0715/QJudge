"""View-layer adapters for exam validation errors."""

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response

from ..services.exam_validation import validate_exam_operation


def _error_detail_to_message(detail) -> str:
    if isinstance(detail, dict):
        parts = []
        for field, value in detail.items():
            message = _error_detail_to_message(value)
            parts.append(f"{field}: {message}" if field else message)
        return " ".join(part for part in parts if part)

    if isinstance(detail, (list, tuple)):
        return " ".join(_error_detail_to_message(item) for item in detail)

    return str(detail)


def validate_exam_operation_for_view(*args, **kwargs):
    """Return ``(participant, error_response)`` for legacy exam endpoints."""
    try:
        return validate_exam_operation(*args, **kwargs), None
    except APIException as exc:
        message = _error_detail_to_message(getattr(exc, "detail", str(exc)))
        return None, Response(
            {"error": message},
            status=getattr(exc, "status_code", status.HTTP_400_BAD_REQUEST),
        )
