"""Canonical API lifecycle against the real independent PostgreSQL database."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace
from uuid import UUID

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.dependencies import (
    current_bearer_token,
    current_principal,
    get_active_run_reader,
    get_event_reader,
    get_run_service,
    get_session_service,
    get_usage_service,
)
from application.credential_service import McpUnavailable
from application.run_service import RunService
from application.session_service import SessionService
from application.usage_service import UsageService
from domain.models import Principal, RunStatus
from domain.ports import CredentialLeaseKey
from infrastructure.database.uow import SqlAlchemyUnitOfWork
from main import create_app

OWNER = Principal("https://issuer.test", "teacher-1")


class Checkpoints:
    async def delete_session(self, session_id):
        pass


class Credentials:
    error = None

    async def ensure_ready(self, principal, subject_token):
        if self.error:
            raise self.error
        return CredentialLeaseKey("opaque-lease")


class Dispatcher:
    def __init__(self):
        self.run_ids = []

    async def dispatch(self, run_id, credential_lease_key, trace_context):
        self.run_ids.append(run_id)


class EventReader:
    def __init__(self, uow_factory):
        self.uow_factory = uow_factory

    async def get_run(self, principal, run_id):
        async with self.uow_factory() as uow:
            run = await uow.runs.get_for_owner(principal, run_id)
        if run is None:
            from application.run_service import RunNotFound

            raise RunNotFound(run_id)
        return run

    async def list_after(self, principal, run_id, after):
        async with self.uow_factory() as uow:
            return await uow.runs.list_events_for_owner(principal, run_id, after)


class ActiveRuns:
    async def list_for_owner(self, principal):
        return []


@pytest_asyncio.fixture
async def api_stack(
    db_engine,
) -> AsyncIterator[tuple[httpx.AsyncClient, Credentials, Dispatcher, callable]]:
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    def uow_factory() -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(factory)

    credentials = Credentials()
    dispatcher = Dispatcher()
    app = create_app()
    app.dependency_overrides[current_principal] = lambda: OWNER
    app.dependency_overrides[current_bearer_token] = lambda: "subject-token"
    app.dependency_overrides[get_session_service] = lambda: SessionService(
        uow_factory, Checkpoints()
    )
    app.dependency_overrides[get_run_service] = lambda: RunService(
        uow_factory, credentials, dispatcher
    )
    app.dependency_overrides[get_event_reader] = lambda: EventReader(uow_factory)
    app.dependency_overrides[get_active_run_reader] = ActiveRuns
    app.dependency_overrides[get_usage_service] = lambda: UsageService(uow_factory)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, credentials, dispatcher, uow_factory


@pytest.mark.asyncio
async def test_start_replay_and_complete(api_stack) -> None:
    client, _credentials, dispatcher, uow_factory = api_stack
    session = await client.post("/v1/sessions", json={"context": {}})
    assert session.status_code == 201
    session_id = UUID(session.json()["session_id"])
    run_response = await client.post(
        f"/v1/sessions/{session_id}/runs",
        headers={"Idempotency-Key": "browser-message-1"},
        json={"message": "hello", "model_id": "deepseek-v4"},
    )
    assert run_response.status_code == 202
    run_id = UUID(run_response.json()["run_id"])
    assert dispatcher.run_ids == [run_id]

    async with uow_factory() as uow:
        persisted = await uow.runs.get(run_id)
        assert persisted is not None
        await uow.runs.update(replace(persisted, status=RunStatus.RUNNING))
        await uow.runs.append_event(
            run_id, {"type": "agent_message_delta", "content": "Hello"}
        )
        await uow.runs.append_event(run_id, {"type": "run_completed"})

    response = await client.get(f"/v1/runs/{run_id}/events?after=0")
    assert response.status_code == 200
    assert "id: 1" in response.text
    assert "event: agent_message_delta" in response.text
    assert "event: run_completed" in response.text

    reloaded = await client.get(f"/v1/sessions/{session_id}")
    assert reloaded.status_code == 200
    detail = reloaded.json()
    assert detail["created_at"] is not None
    assert detail["updated_at"] is not None
    assert [message["ordinal"] for message in detail["messages"]] == [1, 2]
    assert detail["messages"][0]["content"] == "hello"
    assert detail["messages"][1]["content"] == "Hello"
    assert detail["messages"][1]["metadata"]["run_status"] == "completed"


@pytest.mark.asyncio
async def test_mcp_failure_does_not_break_persistence_routes(api_stack) -> None:
    client, credentials, _dispatcher, _uow = api_stack
    created = await client.post("/v1/sessions", json={"context": {}})
    session_id = created.json()["session_id"]
    credentials.error = McpUnavailable("offline")

    assert (await client.get("/v1/sessions")).status_code == 200
    assert (await client.get("/v1/models")).status_code == 200
    assert (await client.get("/v1/usage")).status_code == 200
    failed = await client.post(
        f"/v1/sessions/{session_id}/runs",
        headers={"Idempotency-Key": "mcp-down"},
        json={"message": "hello", "model_id": "deepseek-v4"},
    )
    assert failed.status_code == 503
    assert failed.json()["error"]["code"] == "MCP_UNAVAILABLE"


@pytest.mark.asyncio
async def test_foreign_owner_cannot_read_session_run_or_events(api_stack) -> None:
    client, _credentials, _dispatcher, _uow = api_stack
    created = await client.post("/v1/sessions", json={"context": {}})
    session_id = created.json()["session_id"]
    started = await client.post(
        f"/v1/sessions/{session_id}/runs",
        headers={"Idempotency-Key": "owner-run"},
        json={"message": "hello", "model_id": "deepseek-v4"},
    )
    run_id = started.json()["run_id"]
    client._transport.app.dependency_overrides[current_principal] = lambda: Principal(
        OWNER.issuer, "other"
    )
    assert (await client.get(f"/v1/sessions/{session_id}")).status_code == 404
    assert (await client.get(f"/v1/runs/{run_id}")).status_code == 404
    assert (await client.get(f"/v1/runs/{run_id}/events")).status_code == 404
