from __future__ import annotations

import base64
import hashlib
import hmac
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from redis.asyncio import Redis

from domain.models import Principal
from domain.ports import CredentialLease
from infrastructure.mcp.credential_lease import RedisCredentialLeaseStore


def _redis_url() -> str:
    value = os.environ.get("AI_TEST_REDIS_URL", "").strip()
    if not value:
        pytest.fail(
            "AI_TEST_REDIS_URL is required for credential lease integration tests; "
            "a real isolated Redis database must be provided."
        )
    return value


@pytest_asyncio.fixture
async def redis_client() -> AsyncIterator[Redis]:
    client = Redis.from_url(_redis_url(), decode_responses=False)
    try:
        await client.ping()
        await client.flushdb()
        yield client
    finally:
        await client.flushdb()
        await client.aclose()


@pytest.fixture
def secret() -> str:
    return "credential-lease-secret-that-is-long-enough"


async def test_key_matches_hmac_of_issuer_subject_and_server_only(
    redis_client: Redis,
    secret: str,
) -> None:
    principal = Principal(issuer="https://issuer.test", subject="teacher-42")
    store = RedisCredentialLeaseStore(
        redis_client,
        secret=secret,
        mcp_server_id="qjudge",
    )

    hmac_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"qjudge-ai/mcp-credential-lease/hmac/v1",
    ).derive(secret.encode())
    identity = b"https://issuer.test\0teacher-42\0qjudge"
    expected = hmac.new(hmac_key, identity, hashlib.sha256).hexdigest()

    assert store.key_for(principal).value == f"mcp:lease:{expected}"


async def test_stored_value_is_encrypted_and_ttl_is_bounded_by_token(
    redis_client: Redis,
    secret: str,
) -> None:
    now = datetime.now(UTC)
    principal = Principal(issuer="https://issuer.test", subject="teacher-42")
    store = RedisCredentialLeaseStore(
        redis_client,
        secret=secret,
        mcp_server_id="qjudge",
        now=lambda: now,
    )
    key = store.key_for(principal)
    lease = CredentialLease(
        subject_token="sensitive-ai-token",
        mcp_token="sensitive-mcp-token",
        expires_at=now + timedelta(seconds=6),
        scopes=frozenset({"mcp", "read"}),
    )

    await store.put(key, lease)

    raw = await redis_client.get(key.value)
    ttl = await redis_client.ttl(key.value)
    assert raw is not None
    assert b"sensitive-ai-token" not in raw
    assert b"sensitive-mcp-token" not in raw
    assert 1 <= ttl <= 6
    assert await store.get(key) == lease


async def test_ciphertext_copied_to_another_principal_key_is_rejected_and_deleted(
    redis_client: Redis,
    secret: str,
) -> None:
    now = datetime.now(UTC)
    store = RedisCredentialLeaseStore(
        redis_client,
        secret=secret,
        mcp_server_id="qjudge",
        now=lambda: now,
    )
    source_key = store.key_for(Principal("https://issuer.test", "teacher-42"))
    destination_key = store.key_for(
        Principal("https://issuer.test", "teacher-99")
    )
    lease = CredentialLease(
        subject_token="teacher-42-ai-token",
        mcp_token="teacher-42-mcp-token",
        expires_at=now + timedelta(minutes=5),
        scopes=frozenset({"mcp"}),
    )
    await store.put(source_key, lease)
    copied_ciphertext = await redis_client.get(source_key.value)
    assert copied_ciphertext is not None
    await redis_client.set(destination_key.value, copied_ciphertext, ex=300)

    assert await store.get(destination_key) is None
    assert await redis_client.exists(destination_key.value) == 0
    assert await store.get(source_key) == lease


async def test_expired_lease_cannot_be_persisted(
    redis_client: Redis,
    secret: str,
) -> None:
    now = datetime.now(UTC)
    store = RedisCredentialLeaseStore(
        redis_client,
        secret=secret,
        mcp_server_id="qjudge",
        now=lambda: now,
    )
    key = store.key_for(Principal("https://issuer.test", "teacher-42"))
    expired = CredentialLease(
        subject_token="expired-ai-token",
        mcp_token="expired-mcp-token",
        expires_at=now,
        scopes=frozenset({"mcp"}),
    )

    with pytest.raises(ValueError, match="already expired"):
        await store.put(key, expired)

    assert await redis_client.get(key.value) is None


async def test_fernet_and_hmac_use_distinct_hkdf_material(
    redis_client: Redis,
    secret: str,
) -> None:
    store = RedisCredentialLeaseStore(
        redis_client,
        secret=secret,
        mcp_server_id="qjudge",
    )
    hmac_material = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"qjudge-ai/mcp-credential-lease/hmac/v1",
    ).derive(secret.encode())
    fernet_material = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"qjudge-ai/mcp-credential-lease/fernet/v1",
    ).derive(secret.encode())

    assert hmac_material != fernet_material
    assert len(base64.urlsafe_b64encode(fernet_material)) == 44
    assert store.key_for(Principal("issuer", "subject")).value.startswith(
        "mcp:lease:"
    )
