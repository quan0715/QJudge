"""Run-token-scoped HTTP client for the Backend private integrity API."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any
from uuid import UUID

import httpx


class BackendUnavailable(RuntimeError):
    """A retryable Backend or object-storage operation did not succeed."""


class BackendProtocolError(RuntimeError):
    """The Backend returned a non-retryable or malformed response."""


class BackendDeliveryUncertain(BackendUnavailable):
    """A transport failed after request application may have begun."""


class BackendClient:
    RETRYABLE_STATUSES = frozenset((502, 503, 504))

    def __init__(
        self,
        *,
        base_url: str,
        run_id: UUID,
        token: str,
        retry_attempts: int = 3,
        connect_timeout_seconds: float = 2.0,
        request_timeout_seconds: float = 5.0,
        transport: httpx.BaseTransport | None = None,
        upload_transport: httpx.BaseTransport | None = None,
    ) -> None:
        if retry_attempts < 1:
            raise ValueError("retry_attempts must be positive")
        self._run_id = run_id
        self._retry_attempts = retry_attempts
        timeout = httpx.Timeout(
            request_timeout_seconds, connect=connect_timeout_seconds
        )
        client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
            transport=transport,
        )
        try:
            upload_client = httpx.Client(
                timeout=timeout,
                transport=upload_transport,
            )
        except BaseException:
            client.close()
            raise
        self._client = client
        self._upload_client = upload_client
        self._closed = False

    def fetch_bootstrap(self) -> dict[str, object]:
        path = f"/api/v1/internal/integrity/runs/{self._run_id}/bootstrap/"
        response = self._request("GET", path)
        return self._response_json(response)

    def bootstrap(self) -> dict[str, object]:
        """Compatibility name for the single run-scoped bootstrap operation."""
        return self.fetch_bootstrap()

    def send_commands(
        self, commands: tuple[dict[str, object], ...]
    ) -> dict[str, object]:
        if type(commands) is not tuple:
            raise TypeError("commands must be an immutable tuple")
        for command in commands:
            if not isinstance(command, Mapping) or not command.get("command_id"):
                raise ValueError("every command must carry its deterministic command_id")
        body = json.dumps(
            {"commands": commands},
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        ).encode("utf-8")
        path = f"/api/v1/internal/integrity/runs/{self._run_id}/commands/"
        response = self._request(
            "POST", path, content=body, headers={"Content-Type": "application/json"}
        )
        return self._response_json(response)

    def upload_presigned(self, url: str, content: bytes, sha256: str) -> None:
        try:
            response = self._upload_client.put(
                url,
                content=content,
                headers={"Content-SHA256": sha256},
            )
        except (httpx.ConnectError, httpx.ConnectTimeout) as error:
            raise BackendUnavailable("archive storage is unavailable") from error
        except httpx.TransportError as error:
            raise BackendDeliveryUncertain(
                "archive storage delivery is unavailable"
            ) from error
        if response.status_code < 200 or response.status_code >= 300:
            if response.status_code in self.RETRYABLE_STATUSES:
                raise BackendUnavailable("archive storage is unavailable")
            raise BackendProtocolError("archive storage rejected the upload")

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._client.close()
        finally:
            self._upload_client.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        for attempt in range(self._retry_attempts):
            try:
                response = self._client.request(method, path, **kwargs)
            except (httpx.ConnectError, httpx.ConnectTimeout) as error:
                if attempt + 1 == self._retry_attempts:
                    raise BackendUnavailable("Backend is unavailable") from error
                continue
            except httpx.TransportError as error:
                raise BackendDeliveryUncertain(
                    "Backend delivery is unavailable"
                ) from error
            if response.status_code in self.RETRYABLE_STATUSES:
                if attempt + 1 == self._retry_attempts:
                    raise BackendUnavailable("Backend is unavailable")
                continue
            if response.status_code < 200 or response.status_code >= 300:
                raise BackendProtocolError("Backend rejected the Worker request")
            return response
        raise AssertionError("unreachable retry loop")

    @staticmethod
    def _response_json(response: httpx.Response) -> dict[str, object]:
        try:
            payload = response.json()
        except ValueError as error:
            raise BackendProtocolError("Backend returned an invalid response") from error
        if not isinstance(payload, dict):
            raise BackendProtocolError("Backend returned an invalid response")
        return payload
