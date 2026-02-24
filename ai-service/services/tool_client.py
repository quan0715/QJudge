"""HMAC-signed HTTP client for calling backend internal APIs."""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json as _json
import logging
import time
import uuid
from typing import Any

import httpx
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class InternalToolClient:
    """HTTP client that signs every request with HMAC-SHA256.

    Signature: HMAC_SHA256(secret, method + path + SHA256(body) + timestamp + nonce)
    """

    def __init__(
        self,
        backend_url: str,
        service_id: str,
        hmac_secret: str,
    ) -> None:
        self._backend_url = backend_url.rstrip("/")
        self._service_id = service_id
        self._hmac_secret = hmac_secret.encode("utf-8")
        self._http = httpx.AsyncClient(
            base_url=self._backend_url,
            timeout=httpx.Timeout(30.0, connect=10.0),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def prepare_action(
        self,
        session_id: str,
        user_id: int,
        action_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """POST /internal/problem-actions/prepare"""
        return await self._request(
            "POST",
            "/internal/problem-actions/prepare",
            json_body={
                "session_id": session_id,
                "user_id": user_id,
                "action_type": action_type,
                "payload": payload,
            },
        )

    async def commit_action(self, action_id: str) -> dict[str, Any]:
        """POST /internal/problem-actions/commit"""
        return await self._request(
            "POST",
            "/internal/problem-actions/commit",
            json_body={"action_id": action_id},
        )

    async def load_problem_context(self, problem_id: int) -> dict[str, Any]:
        """GET /internal/problems/{id}/context"""
        return await self._request(
            "GET",
            f"/internal/problems/{problem_id}/context",
        )

    async def get_pending_action(self, action_id: str) -> dict[str, Any]:
        """GET /internal/pending-actions/{action_id}"""
        return await self._request(
            "GET",
            f"/internal/pending-actions/{action_id}",
        )

    async def get_test_cases(self, problem_id: int) -> dict[str, Any]:
        """GET /internal/problems/{id}/test-cases"""
        return await self._request(
            "GET",
            f"/internal/problems/{problem_id}/test-cases",
        )

    async def run_code(
        self,
        code: str,
        language: str,
        test_cases: list[dict[str, str]],
        time_limit: int = 1000,
        memory_limit: int = 128,
    ) -> dict[str, Any]:
        """POST /internal/code/run — execute code in sandbox (long timeout)."""
        return await self._request(
            "POST",
            "/internal/code/run",
            json_body={
                "code": code,
                "language": language,
                "test_cases": test_cases,
                "time_limit": time_limit,
                "memory_limit": memory_limit,
            },
            timeout=120.0,
        )

    async def close(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Request signing
    # ------------------------------------------------------------------

    def _sign_request(self, method: str, path: str, body: bytes) -> dict[str, str]:
        timestamp = str(int(time.time()))
        nonce = uuid.uuid4().hex

        body_sha256 = hashlib.sha256(body).hexdigest()
        message = f"{method}{path}{body_sha256}{timestamp}{nonce}"

        signature = hmac_mod.new(
            self._hmac_secret,
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return {
            "X-AI-Service-ID": self._service_id,
            "X-AI-Timestamp": timestamp,
            "X-AI-Nonce": nonce,
            "X-AI-Signature": signature,
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        json_body: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        raw_body = _json.dumps(json_body).encode("utf-8") if json_body is not None else b""
        # Sign with the full path as seen by Django (base_url path + relative path)
        full_path = urlparse(self._backend_url).path.rstrip("/") + path
        headers = self._sign_request(method, full_path, raw_body)
        headers["Content-Type"] = "application/json"

        logger.debug("ToolClient %s %s", method, path)

        try:
            kwargs: dict[str, Any] = {
                "method": method,
                "url": path,
                "content": raw_body if raw_body else None,
                "headers": headers,
            }
            if timeout is not None:
                kwargs["timeout"] = timeout

            response = await self._http.request(**kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Backend returned %s for %s %s: %s",
                exc.response.status_code,
                method,
                path,
                exc.response.text[:500],
            )
            raise
        except httpx.RequestError as exc:
            logger.error("Request to backend failed for %s %s: %s", method, path, exc)
            raise
