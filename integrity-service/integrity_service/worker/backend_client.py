"""Run-token-scoped HTTP client for the Backend private integrity API."""

from __future__ import annotations

import base64
import json
import time
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
        resident_mode: bool = False,
        credential_provider=None,
    ) -> None:
        if retry_attempts < 1:
            raise ValueError("retry_attempts must be positive")
        self._run_id = run_id
        self._resident_mode = resident_mode
        self._credential_provider = credential_provider
        self._retry_attempts = retry_attempts
        timeout = httpx.Timeout(
            request_timeout_seconds, connect=connect_timeout_seconds
        )
        client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"{'Resident' if resident_mode else 'Bearer'} {token}"},
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

    def fetch_resident_descriptors(self, public_key, *, now_seconds=None):
        from integrity_service.worker.auth import verify_resident_request
        if not self._resident_mode:
            raise BackendProtocolError("resident protocol required")
        response = self._request("GET", "/api/v1/internal/integrity/resident/descriptors/")
        payload = self._response_json(response)
        descriptors = payload.get("descriptors")
        if not isinstance(descriptors, list) or len(descriptors) > 256:
            raise BackendProtocolError("invalid descriptor list")
        verified = []
        for envelope in descriptors:
            try:
                body = envelope["body"].encode("utf-8")
                if len(body) > 1024 * 1024:
                    raise ValueError("descriptor exceeds limit")
                descriptor = json.loads(body)
                run_id = UUID(descriptor["bootstrap"]["run_id"])
                h = envelope["headers"]
                verify_resident_request(public_key, method="PUT", path=f"/v1/runs/{run_id}", run_id=run_id,
                    revision=h["X-QJudge-Revision"], protocol=h["X-QJudge-Protocol"], timestamp=h["X-QJudge-Timestamp"],
                    header_run_id=h["X-QJudge-Run-Id"], signature_b64=h["X-QJudge-Signature"], body=body,
                    now_seconds=int(time.time()) if now_seconds is None else now_seconds)
                if str(descriptor["schedule_revision"]) != h["X-QJudge-Revision"]:
                    raise ValueError("descriptor revision mismatch")
                verified.append(descriptor)
            except (KeyError, ValueError, TypeError, AttributeError) as error:
                raise BackendProtocolError("unauthenticated recovery descriptor") from error
        return verified

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

    def finalize_control(self, body):
        if not self._resident_mode:
            raise BackendProtocolError("resident protocol required")
        from integrity_service.resident.lifecycle import StaleSchedule
        path = f"/api/v1/internal/integrity/runs/{self._run_id}/finalize/"
        try:
            response = self._request("POST", path, json=body)
        except BackendProtocolError as error:
            raise StaleSchedule("backend finalization not authorized") from error
        return self._response_json(response)

    def upload_presigned(
        self,
        url: str,
        content: bytes,
        sha256: str,
        content_type: str,
    ) -> None:
        try:
            checksum = base64.b64encode(bytes.fromhex(sha256)).decode("ascii")
        except ValueError as error:
            raise BackendProtocolError("archive checksum is invalid") from error
        try:
            response = self._upload_client.put(
                url,
                content=content,
                headers={
                    "Content-Type": content_type,
                    "x-amz-checksum-sha256": checksum,
                },
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
        if self._credential_provider is not None:
            token = self._credential_provider()
            headers = dict(kwargs.pop("headers", {}))
            headers["Authorization"] = f"{'Resident' if self._resident_mode else 'Bearer'} {token}"
            kwargs["headers"] = headers
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
