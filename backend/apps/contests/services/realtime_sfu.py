"""Cloudflare Realtime SFU broker helpers.

The browser must never receive the Realtime App Secret. This module keeps the
secret on the backend and exposes only narrowly scoped proxy operations.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import requests
from django.conf import settings


class RealtimeSfuError(Exception):
    """Raised when Cloudflare Realtime rejects or fails a broker call."""

    def __init__(self, message: str, *, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


@dataclass(frozen=True)
class RealtimeSfuConfig:
    enabled: bool
    configured: bool
    app_id: str
    api_base_url: str
    stun_urls: tuple[str, ...] = ("stun:stun.cloudflare.com:3478",)


def get_realtime_sfu_config() -> RealtimeSfuConfig:
    app_id = (settings.CLOUDFLARE_REALTIME_APP_ID or "").strip()
    app_secret = (settings.CLOUDFLARE_REALTIME_APP_SECRET or "").strip()
    return RealtimeSfuConfig(
        enabled=bool(settings.LIVE_MONITORING_ENABLED),
        configured=bool(app_id and app_secret),
        app_id=app_id,
        api_base_url=(settings.CLOUDFLARE_REALTIME_API_BASE_URL or "").rstrip("/"),
    )


def build_room_id(contest_id: int, user_id: int) -> str:
    prefix = (settings.LIVE_MONITORING_ROOM_PREFIX or "qjudge-dev-exam").strip()
    return f"{prefix}-{contest_id}-{user_id}"


class RealtimeSfuClient:
    def __init__(self):
        self.config = get_realtime_sfu_config()

    def assert_available(self) -> None:
        if not self.config.enabled:
            raise RealtimeSfuError("Realtime SFU live monitoring is disabled", status_code=403)
        if not self.config.configured:
            raise RealtimeSfuError("Realtime SFU app is not configured", status_code=503)

    def _request(self, method: str, path: str, *, json: dict[str, Any] | None = None):
        self.assert_available()
        url = f"{self.config.api_base_url}{path}"
        try:
            response = requests.request(
                method,
                url,
                json=json,
                headers={
                    "Authorization": f"Bearer {settings.CLOUDFLARE_REALTIME_APP_SECRET}",
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
        except requests.RequestException as exc:
            raise RealtimeSfuError("Realtime SFU request failed", status_code=502) from exc

        payload = None
        try:
            payload = response.json()
        except ValueError:
            payload = {"detail": response.text}

        if response.status_code >= 400:
            message = (
                payload.get("errorDescription")
                or payload.get("error")
                or payload.get("detail")
                or "Realtime SFU request failed"
            )
            raise RealtimeSfuError(message, status_code=response.status_code, payload=payload)
        return payload

    def create_session(self, *, correlation_id: str | None = None) -> dict[str, Any]:
        path = f"/apps/{self.config.app_id}/sessions/new"
        if correlation_id:
            path = f"{path}?{urlencode({'correlationId': correlation_id})}"
        return self._request("POST", path)

    def add_tracks(self, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/apps/{self.config.app_id}/sessions/{session_id}/tracks/new",
            json=payload,
        )

    def renegotiate(self, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "PUT",
            f"/apps/{self.config.app_id}/sessions/{session_id}/renegotiate",
            json=payload,
        )

    def get_session(self, session_id: str) -> dict[str, Any]:
        return self._request(
            "GET",
            f"/apps/{self.config.app_id}/sessions/{session_id}",
        )
