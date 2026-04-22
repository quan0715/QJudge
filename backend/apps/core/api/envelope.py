"""Standard API envelope helpers.

Shape contract
--------------

**Success**::

    {"data": <payload>, "meta": {...}}

- ``data``: main payload; may be an array, object, or null.
- ``meta``: optional hints (count, projection, filters applied, timing).

**Error**::

    {
      "errors": [
        {"code": "PERMISSION_DENIED", "message": "...", "field": null, "details": {}}
      ],
      "meta": {"request_id": "...", "timestamp": "..."}
    }

- ``errors``: non-empty array; one entry per distinct error (validation may be
  multiple).
- ``meta.request_id`` / ``meta.timestamp``: always present on error envelopes;
  lifted from the legacy ``{success, error}`` shape so they live at the same
  path as success-case meta.

When to use
-----------
- Non-paginated collection endpoints and custom actions.
- DRF's native paginated list endpoints keep ``{count, next, previous, results}``.
- Opt-in per action via ``envelope_error_actions`` on the view:

    class FooViewSet(...):
        envelope_error_actions = {"my_action"}

  The custom exception handler only produces envelope errors for actions in
  that set; all other actions keep the legacy ``{success, error}`` shape for
  backward compatibility.
"""
from typing import Any, Iterable, Mapping

from rest_framework.response import Response


def envelope(data: Any, *, meta: Mapping[str, Any] | None = None, status: int = 200) -> Response:
    """Wrap a success payload in the standard envelope."""
    return Response({"data": data, "meta": dict(meta or {})}, status=status)


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
    return Response(
        {"errors": list(errors), "meta": dict(meta or {})},
        status=status,
    )
