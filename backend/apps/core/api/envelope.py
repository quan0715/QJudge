"""Explicit success/error envelope helpers.

Both shapes require object ``meta``. Generic helpers preserve supplied codes
and metadata; request-aware contract helpers add request_id/timestamp and
normalize codes. ContractJSONRenderer recognizes EnvelopeResponse so it can
wrap raw resources without double-wrapping helper responses. Native DRF
pagination remains unchanged outside a migrated/negotiated JSON boundary.
"""
from typing import Any, Iterable, Mapping

from rest_framework.response import Response


class EnvelopeResponse(Response):
    """Explicit envelope, distinguishable from a resource with data/meta fields."""


def envelope(data: Any, *, meta: Mapping[str, Any] | None = None, status: int = 200) -> Response:
    """Wrap a success payload in the standard envelope."""
    return EnvelopeResponse({"data": data, "meta": dict(meta or {})}, status=status)


def envelope_error(
    code: str,
    message: str,
    *,
    field: str | None = None,
    status: int = 400,
    details: Mapping[str, Any] | None = None,
    meta: Mapping[str, Any] | None = None,
) -> Response:
    """Return a single-error envelope response.

    For multi-error responses, construct the list manually and call
    :func:`envelope_errors`.
    """
    return envelope_errors(
        [{"code": code, "message": message, "field": field, "details": dict(details or {})}],
        status=status,
        meta=meta,
    )


def envelope_errors(
    errors: Iterable[Mapping[str, Any]],
    *,
    status: int = 400,
    meta: Mapping[str, Any] | None = None,
) -> Response:
    """Return a multi-error envelope response."""
    return EnvelopeResponse(
        {"errors": list(errors), "meta": dict(meta or {})},
        status=status,
    )


def error_meta(request):
    from django.utils import timezone
    return {"request_id": getattr(request, "request_id", None), "timestamp": timezone.now().isoformat()}


def contract_error_response(request, code, message, *, status=400, details=None, field=None):
    return envelope_error(code.lower(), message, status=status, details=details, field=field, meta=error_meta(request))


def contract_validation_error_response(request, message, details):
    errors = []
    def visit(value, field=None):
        if isinstance(value, dict):
            for key, child in value.items():
                visit(child, f"{field}.{key}" if field else key)
        elif isinstance(value, (list, tuple)):
            for child in value:
                visit(child, field)
        else:
            errors.append({"code": "validation_error", "message": str(value), "field": field, "details": {}})
    visit(details)
    return envelope_errors(errors or [{"code": "validation_error", "message": message, "field": None, "details": {}}], meta=error_meta(request))
