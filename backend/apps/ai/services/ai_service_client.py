"""Small authenticated HTTP boundary from Django to the autonomous AI Service."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any
from urllib.parse import urlencode

import httpx
from django.conf import settings

from apps.oauth.resource_tokens import issue_resource_token


class AIServiceUnavailable(RuntimeError):
    """The AI Service could not be reached within the configured deadline."""


def request_id_for(request) -> str:
    return str(
        getattr(request, "request_id", None)
        or request.headers.get("X-Request-ID")
        or "unknown"
    )


def unavailable_error(request) -> dict[str, object]:
    return {
        "success": False,
        "error": {
            "code": "AI_SERVICE_UNAVAILABLE",
            "message": "AI Service is temporarily unavailable.",
            "retryable": True,
            "request_id": request_id_for(request),
        },
    }


def safe_upstream_error(response: httpx.Response, request) -> dict[str, object]:
    fallback_request_id = request_id_for(request)
    try:
        raw = response.json()
    except (ValueError, UnicodeDecodeError):
        raw = {}
    detail = raw.get("error", {}) if isinstance(raw, dict) else {}
    if not isinstance(detail, dict):
        detail = {}
    code = detail.get("code")
    message = detail.get("message")
    upstream_request_id = detail.get("request_id")
    return {
        "success": False,
        "error": {
            "code": code if isinstance(code, str) else "AI_SERVICE_ERROR",
            "message": (
                message
                if isinstance(message, str)
                else "AI Service could not complete the request."
            ),
            "retryable": bool(detail.get("retryable", response.status_code >= 500)),
            "request_id": (
                upstream_request_id
                if isinstance(upstream_request_id, str)
                else fallback_request_id
            ),
        },
    }


class AIServiceClient:
    """Issue a short-lived user token and make one bounded upstream call."""

    def __init__(self, *, transport: httpx.BaseTransport | None = None) -> None:
        self._transport = transport

    def _timeout(self) -> httpx.Timeout:
        return httpx.Timeout(
            connect=settings.AI_SERVICE_CONNECT_TIMEOUT_SECONDS,
            read=settings.AI_SERVICE_READ_TIMEOUT_SECONDS,
            write=settings.AI_SERVICE_WRITE_TIMEOUT_SECONDS,
            pool=settings.AI_SERVICE_POOL_TIMEOUT_SECONDS,
        )

    def _new_client(self) -> httpx.Client:
        return httpx.Client(
            base_url=str(settings.AI_SERVICE_URL).rstrip("/"),
            timeout=self._timeout(),
            follow_redirects=False,
            transport=self._transport,
        )

    def headers_for(self, user, request) -> dict[str, str]:
        token = issue_resource_token(
            user,
            audience="ai-service",
            scopes=frozenset({"ai:chat"}),
            lifetime_seconds=settings.AI_ACCESS_TOKEN_SECONDS,
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Request-ID": request_id_for(request),
        }
        if traceparent := request.headers.get("traceparent"):
            headers["traceparent"] = traceparent
        if idempotency_key := request.headers.get("Idempotency-Key"):
            headers["Idempotency-Key"] = idempotency_key
        if last_event_id := request.headers.get("Last-Event-ID"):
            headers["Last-Event-ID"] = last_event_id
        return headers

    def request(
        self,
        method: str,
        path: str,
        user,
        request,
        json_body: object | None = None,
    ) -> httpx.Response:
        headers = self.headers_for(user, request)
        if (
            method.upper() == "POST"
            and path.rstrip("/").endswith("/runs")
            and "Idempotency-Key" not in headers
        ):
            headers["Idempotency-Key"] = request_id_for(request)
        kwargs: dict[str, Any] = {"headers": headers}
        if json_body is not None:
            kwargs["json"] = json_body
        try:
            with self._new_client() as client:
                return client.request(method, path, **kwargs)
        except httpx.TransportError as exc:
            raise AIServiceUnavailable from exc

    def stream(
        self,
        path: str,
        user,
        request,
        query: Mapping[str, object] | None = None,
    ) -> Iterator[bytes]:
        if query:
            encoded_query = urlencode(
                [(key, str(value)) for key, value in query.items() if value is not None]
            )
            if encoded_query:
                path = f"{path}?{encoded_query}"
        client = self._new_client()
        try:
            upstream_request = client.build_request(
                "GET", path, headers=self.headers_for(user, request)
            )
            response = client.send(upstream_request, stream=True)
        except httpx.TransportError as exc:
            client.close()
            raise AIServiceUnavailable from exc

        if response.status_code >= 400:
            response.read()
            response.close()
            client.close()
            error = AIServiceUpstreamResponse(response)
            raise error

        def chunks() -> Iterator[bytes]:
            try:
                yield from response.iter_bytes()
            finally:
                response.close()
                client.close()

        return chunks()


class AIServiceUpstreamResponse(RuntimeError):
    """A stream request was rejected before any response bytes were proxied."""

    def __init__(self, response: httpx.Response) -> None:
        super().__init__(f"AI Service returned HTTP {response.status_code}")
        self.response = response


def get_ai_service_client() -> AIServiceClient:
    return AIServiceClient()
