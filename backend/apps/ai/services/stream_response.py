"""Shared SSE response helpers."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from django.http import StreamingHttpResponse


def build_sse_response(generator: AsyncGenerator[str, None]) -> StreamingHttpResponse:
    """Wrap an async generator in a standard SSE response."""
    response = StreamingHttpResponse(generator, content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
