"""
Custom exception handler for consistent API responses.

Two error formats coexist during the envelope migration:

1. Legacy (default, all views)::

       {"success": false, "error": {"code", "message", "request_id", "timestamp", "details"}}

2. New envelope (opt-in per action via ``envelope_error_actions`` on the view)::

       {
         "errors": [{"code", "message", "field", "details"}],
         "meta": {"request_id", "timestamp"}
       }

See :mod:`apps.core.api.envelope` for the success-path contract and helpers.
"""
from django.db import OperationalError
from django.utils import timezone
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def _get_request_id(context):
    request = context.get("request")
    return getattr(request, "request_id", None) if request else None


def _should_use_envelope_errors(context):
    view = context.get("view")
    if view is None:
        return False
    allowed = getattr(view, "envelope_error_actions", None)
    action = getattr(view, "action", None)
    if allowed is None or action is None:
        return False
    return action in allowed


def _build_envelope_error_payload(exc, *, request_id, now):
    """Translate a DRF response payload into the envelope error shape."""
    code = getattr(exc, "default_code", "unknown_error")
    message = str(exc)
    detail = getattr(exc, "detail", None)

    errors = []
    if isinstance(detail, dict):
        for field, msgs in detail.items():
            msgs_list = msgs if isinstance(msgs, (list, tuple)) else [msgs]
            for m in msgs_list:
                errors.append({
                    "code": getattr(m, "code", None) or "validation_error",
                    "message": str(m),
                    "field": field,
                    "details": {},
                })
    elif isinstance(detail, (list, tuple)):
        for m in detail:
            errors.append({
                "code": getattr(m, "code", None) or code,
                "message": str(m),
                "field": None,
                "details": {},
            })

    if not errors:
        errors = [{
            "code": code,
            "message": message,
            "field": None,
            "details": {},
        }]

    return {
        "errors": errors,
        "meta": {
            "request_id": request_id,
            "timestamp": now,
        },
    }


def custom_exception_handler(exc, context):
    """Return a consistent error response.

    For views that opt into envelope errors (via ``envelope_error_actions``),
    shape the response as the envelope error format. Otherwise use the legacy
    ``{success, error}`` format.
    """
    response = exception_handler(exc, context)
    request_id = _get_request_id(context)
    now = timezone.now().isoformat()
    envelope_mode = _should_use_envelope_errors(context)

    if response is None and isinstance(exc, OperationalError):
        message = str(exc)
        if "too many clients" in message.lower():
            if envelope_mode:
                response = Response(
                    {
                        "errors": [{
                            "code": "db_overloaded",
                            "message": "Database is temporarily overloaded. Please retry.",
                            "field": None,
                            "details": {},
                        }],
                        "meta": {"request_id": request_id, "timestamp": now},
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            else:
                response = Response(
                    {
                        "success": False,
                        "error": {
                            "code": "DB_OVERLOADED",
                            "message": "Database is temporarily overloaded. Please retry.",
                            "request_id": request_id,
                            "timestamp": now,
                        },
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            response["Retry-After"] = "2"
            response["X-QJudge-Retryable"] = "true"
            return response

    if response is not None:
        if envelope_mode:
            response.data = _build_envelope_error_payload(
                exc, request_id=request_id, now=now,
            )
            return response

        error_code = getattr(exc, 'default_code', 'UNKNOWN_ERROR').upper()

        custom_response_data = {
            'success': False,
            'error': {
                'code': error_code,
                'message': str(exc),
                'request_id': request_id,
                'timestamp': now,
            }
        }

        if hasattr(exc, 'detail'):
            if isinstance(exc.detail, dict):
                custom_response_data['error']['details'] = exc.detail
            elif isinstance(exc.detail, list):
                custom_response_data['error']['details'] = {'errors': exc.detail}

        response.data = custom_response_data

    return response
