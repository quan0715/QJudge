"""Encrypted, identity-derived MCP credential leases stored in Redis."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
from datetime import UTC, datetime
from typing import Callable

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from redis.asyncio import Redis
from redis.exceptions import RedisError

from domain.models import Principal
from domain.ports import CredentialLease, CredentialLeaseKey, McpUnavailable

_HMAC_INFO = b"qjudge-ai/mcp-credential-lease/hmac/v1"
_FERNET_INFO = b"qjudge-ai/mcp-credential-lease/fernet/v1"


def _derive(secret: bytes, *, info: bytes) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=info,
    ).derive(secret)


class RedisCredentialLeaseStore:
    """Store no plaintext credentials and let Redis enforce token lifetime."""

    def __init__(
        self,
        redis: Redis,
        *,
        secret: str,
        mcp_server_id: str,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if len(secret) < 32:
            raise ValueError("credential lease secret must be at least 32 characters")
        secret_bytes = secret.encode()
        self._redis = redis
        self._mcp_server_id = mcp_server_id
        self._hmac_key = _derive(secret_bytes, info=_HMAC_INFO)
        self._fernet = Fernet(
            base64.urlsafe_b64encode(
                _derive(secret_bytes, info=_FERNET_INFO)
            )
        )
        self._now = now or (lambda: datetime.now(UTC))

    @classmethod
    def from_url(
        cls,
        redis_url: str,
        *,
        secret: str,
        mcp_server_id: str,
    ) -> "RedisCredentialLeaseStore":
        return cls(
            Redis.from_url(redis_url, decode_responses=False),
            secret=secret,
            mcp_server_id=mcp_server_id,
        )

    def key_for(self, principal: Principal) -> CredentialLeaseKey:
        identity = (
            f"{principal.issuer}\0{principal.subject}\0{self._mcp_server_id}"
        ).encode()
        digest = hmac.new(self._hmac_key, identity, hashlib.sha256).hexdigest()
        return CredentialLeaseKey(f"mcp:lease:{digest}")

    async def get(self, key: CredentialLeaseKey) -> CredentialLease | None:
        try:
            encrypted = await self._redis.get(key.value)
        except RedisError as exc:
            raise McpUnavailable("Credential lease store is unavailable") from exc
        if encrypted is None:
            return None

        try:
            payload = json.loads(self._fernet.decrypt(encrypted))
            expires_at = datetime.fromisoformat(payload["expires_at"])
            if expires_at.tzinfo is None:
                raise ValueError("lease expiry must be timezone-aware")
            lease = CredentialLease(
                subject_token=str(payload["subject_token"]),
                mcp_token=str(payload["mcp_token"]),
                expires_at=expires_at,
                scopes=frozenset(str(scope) for scope in payload["scopes"]),
            )
        except (InvalidToken, KeyError, TypeError, ValueError, json.JSONDecodeError):
            await self.delete(key)
            return None

        if lease.expires_at <= self._now():
            await self.delete(key)
            return None
        return lease

    async def put(self, key: CredentialLeaseKey, lease: CredentialLease) -> None:
        payload = json.dumps(
            {
                "subject_token": lease.subject_token,
                "mcp_token": lease.mcp_token,
                "expires_at": lease.expires_at.isoformat(),
                "scopes": sorted(lease.scopes),
            },
            separators=(",", ":"),
        ).encode()
        encrypted = self._fernet.encrypt(payload)
        ttl = max(1, math.floor((lease.expires_at - self._now()).total_seconds()))
        try:
            await self._redis.set(key.value, encrypted, ex=ttl)
        except RedisError as exc:
            raise McpUnavailable("Credential lease store is unavailable") from exc

    async def delete(self, key: CredentialLeaseKey) -> None:
        try:
            await self._redis.delete(key.value)
        except RedisError as exc:
            raise McpUnavailable("Credential lease store is unavailable") from exc
