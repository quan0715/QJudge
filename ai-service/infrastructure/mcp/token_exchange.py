"""Exchange an AI audience token for a delegated QJudge MCP token."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from domain.ports import ExchangedToken, McpAuthFailed


class McpTokenExchangeClient:
    def __init__(
        self,
        exchange_url: str,
        *,
        timeout_seconds: float = 10.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._exchange_url = exchange_url
        self._timeout_seconds = timeout_seconds
        self._client = client

    async def exchange(self, subject_token: str) -> ExchangedToken:
        try:
            response = await self._post(subject_token)
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            access_token = payload["access_token"]
            expires_in = int(payload["expires_in"])
            scopes = frozenset(str(payload["scope"]).split())
            if not isinstance(access_token, str) or not access_token:
                raise ValueError("missing access token")
            if expires_in <= 0:
                raise ValueError("invalid token lifetime")
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise McpAuthFailed("MCP token exchange failed") from exc

        return ExchangedToken(
            access_token=access_token,
            expires_at=datetime.now(UTC) + timedelta(seconds=expires_in),
            scopes=scopes,
        )

    async def _post(self, subject_token: str) -> httpx.Response:
        kwargs = {
            "headers": {"Authorization": f"Bearer {subject_token}"},
            "json": {"audience": "qjudge-mcp", "scope": "mcp"},
            "timeout": self._timeout_seconds,
        }
        if self._client is not None:
            return await self._client.post(self._exchange_url, **kwargs)
        async with httpx.AsyncClient() as client:
            return await client.post(self._exchange_url, **kwargs)
