import logging
import time
import uuid

logger = logging.getLogger("qjudge.requests")


class RequestIDMiddleware:
    """Attach a unique request_id to every request and log 4xx/5xx responses."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = request.META.get(
            "HTTP_X_REQUEST_ID", uuid.uuid4().hex[:16]
        )
        start = time.monotonic()
        response = self.get_response(request)
        duration_ms = (time.monotonic() - start) * 1000

        response["X-Request-ID"] = request.request_id

        if response.status_code >= 400:
            logger.warning(
                "HTTP %d %s %s %.0fms user=%s req=%s",
                response.status_code,
                request.method,
                request.get_full_path(),
                duration_ms,
                getattr(request, "user", None) or "-",
                request.request_id,
            )

        return response
