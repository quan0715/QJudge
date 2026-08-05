"""Coordinate short-lived MCP credentials before accepting agent commands."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Callable

from domain.models import Principal
from domain.ports import (
    CredentialLease,
    CredentialLeaseKey,
    CredentialLeaseStore,
    McpAuthFailed,
    McpProtocolError,
    McpReadinessPreflight,
    McpTokenExchange,
    McpToolDiscoveryFailed,
    McpUnavailable,
)

__all__ = [
    "CredentialService",
    "McpAuthFailed",
    "McpProtocolError",
    "McpToolDiscoveryFailed",
    "McpUnavailable",
]


class CredentialService:
    """Reuse a healthy lease or exchange and prove a new credential first."""

    def __init__(
        self,
        lease_store: CredentialLeaseStore,
        exchange: McpTokenExchange,
        preflight: McpReadinessPreflight,
        *,
        now: Callable[[], datetime] | None = None,
        minimum_validity: timedelta = timedelta(seconds=30),
        required_scopes: frozenset[str] = frozenset({"mcp"}),
    ) -> None:
        self._lease_store = lease_store
        self._exchange = exchange
        self._preflight = preflight
        self._now = now or (lambda: datetime.now(UTC))
        self._minimum_validity = minimum_validity
        self._required_scopes = required_scopes

    async def ensure_ready(
        self,
        principal: Principal,
        subject_token: str,
    ) -> CredentialLeaseKey:
        key = self._lease_store.key_for(principal)
        lease = await self._lease_store.get(key)

        if self._is_reusable(lease):
            assert lease is not None
            try:
                await self._preflight.check(lease.mcp_token)
            except McpAuthFailed:
                await self._lease_store.delete(key)
            else:
                # Keep the request credential available for the worker's single
                # bounded re-exchange attempt without changing the opaque key.
                await self._lease_store.put(
                    key,
                    replace(lease, subject_token=subject_token),
                )
                return key
        elif lease is not None:
            await self._lease_store.delete(key)

        exchanged = await self._exchange.exchange(subject_token)
        if not self._required_scopes.issubset(exchanged.scopes):
            raise McpAuthFailed("Exchanged token is missing the MCP scope")
        if exchanged.expires_at <= self._now():
            raise McpAuthFailed("Exchanged MCP token is already expired")

        new_lease = CredentialLease(
            subject_token=subject_token,
            mcp_token=exchanged.access_token,
            expires_at=exchanged.expires_at,
            scopes=exchanged.scopes,
        )
        # A failed probe must never leave a credential for a worker to consume.
        await self._preflight.check(new_lease.mcp_token)
        await self._lease_store.put(key, new_lease)
        return key

    def _is_reusable(self, lease: CredentialLease | None) -> bool:
        return bool(
            lease is not None
            and self._required_scopes.issubset(lease.scopes)
            and lease.expires_at - self._now() >= self._minimum_validity
        )
