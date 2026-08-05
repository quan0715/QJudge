from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from application.credential_service import (
    CredentialService,
    McpAuthFailed,
    McpUnavailable,
)
from domain.models import Principal
from domain.ports import CredentialLease, CredentialLeaseKey, ExchangedToken
from infrastructure.mcp.token_exchange import McpTokenExchangeClient


class FakeLeaseStore:
    def __init__(self) -> None:
        self.leases: dict[CredentialLeaseKey, CredentialLease] = {}

    def key_for(self, principal: Principal) -> CredentialLeaseKey:
        return CredentialLeaseKey(
            f"mcp:lease:{principal.issuer}:{principal.subject}:qjudge"
        )

    async def get(self, key: CredentialLeaseKey) -> CredentialLease | None:
        return self.leases.get(key)

    async def put(self, key: CredentialLeaseKey, lease: CredentialLease) -> None:
        self.leases[key] = lease

    async def delete(self, key: CredentialLeaseKey) -> None:
        self.leases.pop(key, None)


class FakeExchange:
    def __init__(self, now: datetime) -> None:
        self.now = now
        self.subject_tokens: list[str] = []
        self.error: Exception | None = None

    async def exchange(self, subject_token: str) -> ExchangedToken:
        self.subject_tokens.append(subject_token)
        if self.error is not None:
            raise self.error
        return ExchangedToken(
            access_token="mcp-token-from-exchange",
            expires_at=self.now + timedelta(minutes=5),
            scopes=frozenset({"mcp"}),
        )


class FakePreflight:
    def __init__(self) -> None:
        self.tokens: list[str] = []
        self.error: Exception | None = None

    async def check(self, mcp_token: str) -> None:
        self.tokens.append(mcp_token)
        if self.error is not None:
            raise self.error


@pytest.fixture
def now() -> datetime:
    return datetime(2026, 8, 5, 8, tzinfo=UTC)


@pytest.fixture
def principal() -> Principal:
    return Principal(issuer="https://issuer.test", subject="teacher-42")


@pytest.fixture
def lease_store() -> FakeLeaseStore:
    return FakeLeaseStore()


@pytest.fixture
def exchange(now: datetime) -> FakeExchange:
    return FakeExchange(now)


@pytest.fixture
def preflight() -> FakePreflight:
    return FakePreflight()


@pytest.fixture
def service(
    lease_store: FakeLeaseStore,
    exchange: FakeExchange,
    preflight: FakePreflight,
    now: datetime,
) -> CredentialService:
    return CredentialService(
        lease_store,
        exchange,
        preflight,
        now=lambda: now,
        minimum_validity=timedelta(seconds=30),
    )


async def test_scope_does_not_create_another_lease_key(
    service: CredentialService,
    principal: Principal,
) -> None:
    first = await service.ensure_ready(principal, "ai-token-1")
    second = await service.ensure_ready(principal, "ai-token-2")

    assert first == second


async def test_missing_lease_is_exchanged_and_preflighted(
    service: CredentialService,
    exchange: FakeExchange,
    preflight: FakePreflight,
    principal: Principal,
) -> None:
    key = await service.ensure_ready(principal, "fresh-ai-token")

    assert exchange.subject_tokens == ["fresh-ai-token"]
    assert preflight.tokens == ["mcp-token-from-exchange"]
    assert key.value.startswith("mcp:")


async def test_expired_lease_is_exchanged_and_preflighted(
    service: CredentialService,
    lease_store: FakeLeaseStore,
    exchange: FakeExchange,
    preflight: FakePreflight,
    principal: Principal,
    now: datetime,
) -> None:
    key = lease_store.key_for(principal)
    lease_store.leases[key] = CredentialLease(
        subject_token="old-ai-token",
        mcp_token="expired-mcp-token",
        expires_at=now - timedelta(seconds=1),
        scopes=frozenset({"mcp"}),
    )

    result = await service.ensure_ready(principal, "fresh-ai-token")

    assert result == key
    assert exchange.subject_tokens == ["fresh-ai-token"]
    assert preflight.tokens == ["mcp-token-from-exchange"]


async def test_valid_lease_keeps_mcp_token_but_refreshes_subject_token(
    service: CredentialService,
    lease_store: FakeLeaseStore,
    exchange: FakeExchange,
    preflight: FakePreflight,
    principal: Principal,
    now: datetime,
) -> None:
    key = lease_store.key_for(principal)
    lease_store.leases[key] = CredentialLease(
        subject_token="old-ai-token",
        mcp_token="cached-mcp-token",
        expires_at=now + timedelta(minutes=2),
        scopes=frozenset({"mcp"}),
    )

    await service.ensure_ready(principal, "current-ai-token")

    assert exchange.subject_tokens == []
    assert preflight.tokens == ["cached-mcp-token"]
    assert lease_store.leases[key].subject_token == "current-ai-token"


async def test_cached_auth_failure_forces_one_exchange(
    service: CredentialService,
    lease_store: FakeLeaseStore,
    exchange: FakeExchange,
    preflight: FakePreflight,
    principal: Principal,
    now: datetime,
) -> None:
    key = lease_store.key_for(principal)
    lease_store.leases[key] = CredentialLease(
        subject_token="old-ai-token",
        mcp_token="cached-mcp-token",
        expires_at=now + timedelta(minutes=2),
        scopes=frozenset({"mcp"}),
    )

    class AuthThenReady(FakePreflight):
        async def check(self, mcp_token: str) -> None:
            self.tokens.append(mcp_token)
            if mcp_token == "cached-mcp-token":
                raise McpAuthFailed("cached token rejected")

    auth_then_ready = AuthThenReady()
    retrying_service = CredentialService(
        lease_store,
        exchange,
        auth_then_ready,
        now=lambda: now,
    )

    await retrying_service.ensure_ready(principal, "fresh-ai-token")

    assert exchange.subject_tokens == ["fresh-ai-token"]
    assert auth_then_ready.tokens == [
        "cached-mcp-token",
        "mcp-token-from-exchange",
    ]


async def test_preflight_failure_does_not_return_a_lease(
    service: CredentialService,
    lease_store: FakeLeaseStore,
    preflight: FakePreflight,
    principal: Principal,
) -> None:
    preflight.error = McpUnavailable("connection refused")

    with pytest.raises(McpUnavailable) as raised:
        await service.ensure_ready(principal, "ai-token")

    assert raised.value.code == "MCP_UNAVAILABLE"
    assert lease_store.leases == {}


async def test_exchange_failure_is_mapped_and_never_preflighted(
    service: CredentialService,
    lease_store: FakeLeaseStore,
    exchange: FakeExchange,
    preflight: FakePreflight,
    principal: Principal,
) -> None:
    exchange.error = McpAuthFailed("exchange rejected")

    with pytest.raises(McpAuthFailed) as raised:
        await service.ensure_ready(principal, "ai-token")

    assert raised.value.code == "MCP_AUTH_FAILED"
    assert preflight.tokens == []
    assert lease_store.leases == {}


async def test_http_token_exchange_returns_bounded_mcp_token() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer ai-token"
        assert request.read() == b'{"audience":"qjudge-mcp","scope":"mcp"}'
        return httpx.Response(
            200,
            json={
                "access_token": "delegated-mcp-token",
                "token_type": "Bearer",
                "expires_in": 300,
                "scope": "mcp",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        exchange = McpTokenExchangeClient(
            "https://backend.test/api/oauth/token-exchange/",
            client=client,
        )
        before = datetime.now(UTC)
        result = await exchange.exchange("ai-token")

    assert result.access_token == "delegated-mcp-token"
    assert result.scopes == frozenset({"mcp"})
    assert before + timedelta(seconds=299) <= result.expires_at
    assert result.expires_at <= before + timedelta(seconds=301)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"error": "invalid_token"}),
        httpx.Response(200, json={"access_token": "missing-lifetime"}),
    ],
)
async def test_http_token_exchange_failures_map_without_exposing_subject_token(
    response: httpx.Response,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return response

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        exchange = McpTokenExchangeClient(
            "https://backend.test/api/oauth/token-exchange/",
            client=client,
        )
        with pytest.raises(McpAuthFailed) as raised:
            await exchange.exchange("sensitive-subject-token")

    assert raised.value.code == "MCP_AUTH_FAILED"
    assert "sensitive-subject-token" not in str(raised.value)
