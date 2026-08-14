"""Canonical API smoke, validation, ownership and safe-error coverage."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    current_bearer_token,
    current_principal,
    get_active_run_reader,
    get_artifact_service,
    get_event_reader,
    get_readiness_probe,
    get_run_service,
    get_session_service,
    get_usage_service,
)
from application.artifacts import ArtifactNotFound
from application.run_service import RunNotFound
from application.session_service import SessionNotFound
from config import Settings
from domain.models import (
    Artifact,
    Message,
    Principal,
    Run,
    RunKind,
    RunStatus,
    Session,
    SessionDetail,
    UsageSummary,
)
from main import _ReadinessProbe, create_app

OWNER = Principal("https://issuer.test", "teacher-1")
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
RUN_ID = UUID("22222222-2222-4222-8222-222222222222")
ARTIFACT_ID = UUID("33333333-3333-4333-8333-333333333333")


class FakeSessionService:
    def __init__(self) -> None:
        timestamp = datetime(2026, 8, 6, tzinfo=UTC)
        self.timestamp = timestamp
        self.updated_timestamp = timestamp + timedelta(minutes=1)
        self.cleared_timestamp = timestamp + timedelta(minutes=2)
        self.session = Session(
            SESSION_ID,
            OWNER,
            "New chat",
            {"course_id": 7},
            created_at=timestamp,
            updated_at=timestamp,
            message_count=2,
        )
        self.messages = (
            Message(SESSION_ID, 1, RUN_ID, "user", "hello", created_at=timestamp),
            Message(
                SESSION_ID,
                2,
                RUN_ID,
                "assistant",
                "Hello",
                {"run_status": "completed"},
                timestamp,
            ),
        )

    async def create_session(self, principal, context):
        assert principal == OWNER
        self.session = replace(self.session, context=dict(context), message_count=0)
        return self.session

    async def list_sessions(self, principal):
        return [self.session]

    async def get_session(self, principal, session_id):
        if principal != OWNER or session_id != SESSION_ID:
            raise SessionNotFound(session_id)
        return self.session

    async def get_session_detail(self, principal, session_id):
        return SessionDetail(
            session=await self.get_session(principal, session_id),
            messages=self.messages,
            created_at=self.timestamp,
            updated_at=self.timestamp,
        )

    async def rename_session(self, principal, session_id, title):
        await self.get_session(principal, session_id)
        self.session = replace(self.session, title=title)
        return self.session

    async def update_session(
        self,
        principal,
        session_id,
        *,
        title=None,
        context=None,
        context_mode="merge",
    ):
        await self.get_session(principal, session_id)
        next_context = self.session.context
        if context is not None:
            next_context = (
                {**self.session.context, **context}
                if context_mode == "merge"
                else dict(context)
            )
        self.session = replace(
            self.session,
            title=title if title is not None else self.session.title,
            context=next_context,
            updated_at=self.updated_timestamp,
        )
        return self.session

    async def clear_session(self, principal, session_id):
        await self.get_session(principal, session_id)
        self.session = replace(
            self.session, updated_at=self.cleared_timestamp, message_count=0
        )
        return self.session

    async def delete_session(self, principal, session_id):
        await self.get_session(principal, session_id)


class FakeRunService:
    def __init__(self) -> None:
        self.run = Run(
            RUN_ID, SESSION_ID, RunStatus.QUEUED, RunKind.CHAT, "deepseek-v4-flash"
        )
        self.start_token = None
        self.approval_calls = 0

    async def start(
        self, principal, session_id, prompt, model_id, idempotency_key, subject_token
    ):
        self.start_token = subject_token
        return replace(self.run, model_id=model_id)

    async def get(self, principal, run_id):
        if principal != OWNER or run_id != RUN_ID:
            raise RunNotFound(run_id)
        return self.run

    async def cancel(self, principal, run_id):
        await self.get(principal, run_id)
        self.run = replace(self.run, cancel_requested=True)
        return self.run

    async def approve(self, principal, run_id, decision, subject_token):
        self.approval_calls += 1
        await self.get(principal, run_id)
        return self.run

    async def answer(self, principal, run_id, answer, subject_token):
        await self.get(principal, run_id)
        return self.run


class FakeEventReader:
    async def get_run(self, principal, run_id):
        if run_id != RUN_ID:
            raise RunNotFound(run_id)
        return Run(
            RUN_ID, SESSION_ID, RunStatus.COMPLETED, RunKind.CHAT, "deepseek-v4-flash", 0
        )

    async def list_after(self, principal, run_id, after):
        return []


class FakeActiveRunReader:
    async def list_for_owner(self, principal):
        return []


class FakeArtifactService:
    def __init__(self) -> None:
        self.artifact = Artifact(
            ARTIFACT_ID,
            SESSION_ID,
            RUN_ID,
            "output",
            "answer.txt",
            "text/plain",
            5,
            "sum",
        )

    async def put(self, principal, **kwargs):
        return self.artifact

    async def list(self, principal, session_id, **kwargs):
        if session_id != SESSION_ID:
            raise ArtifactNotFound()
        return [self.artifact]

    async def get_metadata(self, principal, artifact_id):
        if artifact_id != ARTIFACT_ID:
            raise ArtifactNotFound()
        return self.artifact

    async def get_content(self, principal, artifact_id):
        await self.get_metadata(principal, artifact_id)
        return b"hello"

    async def get_download_url(self, principal, artifact_id):
        await self.get_metadata(principal, artifact_id)
        return "https://objects.test/answer.txt"


class FakeUsageService:
    async def get_usage_summary(self, principal):
        return UsageSummary(13, 8, 2, datetime(2026, 8, 6, tzinfo=UTC))


class FakeReadiness:
    async def check(self):
        return {"database": "ready", "queue": "ready", "settings": "ready"}


def make_client() -> tuple[TestClient, FakeRunService]:
    app = create_app()
    runs = FakeRunService()
    app.dependency_overrides[current_principal] = lambda: OWNER
    app.dependency_overrides[current_bearer_token] = lambda: "subject-token"
    app.dependency_overrides[get_session_service] = FakeSessionService
    app.dependency_overrides[get_run_service] = lambda: runs
    app.dependency_overrides[get_event_reader] = FakeEventReader
    app.dependency_overrides[get_active_run_reader] = FakeActiveRunReader
    app.dependency_overrides[get_artifact_service] = FakeArtifactService
    app.dependency_overrides[get_usage_service] = FakeUsageService
    app.dependency_overrides[get_readiness_probe] = FakeReadiness
    return TestClient(app), runs


def test_canonical_routes_validate_and_use_bearer_subject_token() -> None:
    client, runs = make_client()
    created = client.post("/v1/sessions", json={"context": {"course_id": 7}})
    assert created.status_code == 201
    assert created.json() == {
        "session_id": str(SESSION_ID),
        "title": "New chat",
        "context": {"course_id": 7},
        "created_at": "2026-08-06T00:00:00Z",
        "updated_at": "2026-08-06T00:00:00Z",
        "message_count": 0,
    }
    started = client.post(
        f"/v1/sessions/{SESSION_ID}/runs",
        headers={"Idempotency-Key": "browser-message-1"},
        json={"message": "hello", "model_id": "deepseek-v4-flash"},
    )
    assert started.status_code == 202
    assert started.json()["run_id"] == str(RUN_ID)
    assert runs.start_token == "subject-token"

    missing_key = client.post(
        f"/v1/sessions/{SESSION_ID}/runs",
        json={"message": "hello", "model_id": "deepseek-v4-flash"},
    )
    assert missing_key.status_code == 422
    assert missing_key.json()["error"]["code"] == "VALIDATION_ERROR"


def test_session_detail_returns_persisted_messages_and_timestamps() -> None:
    client, _ = make_client()

    response = client.get(f"/v1/sessions/{SESSION_ID}")

    assert response.status_code == 200
    assert response.json() == {
        "session_id": str(SESSION_ID),
        "title": "New chat",
        "context": {"course_id": 7},
        "created_at": "2026-08-06T00:00:00Z",
        "updated_at": "2026-08-06T00:00:00Z",
        "message_count": 2,
        "messages": [
            {
                "session_id": str(SESSION_ID),
                "ordinal": 1,
                "run_id": str(RUN_ID),
                "role": "user",
                "content": "hello",
                "metadata": {},
                "created_at": "2026-08-06T00:00:00Z",
            },
            {
                "session_id": str(SESSION_ID),
                "ordinal": 2,
                "run_id": str(RUN_ID),
                "role": "assistant",
                "content": "Hello",
                "metadata": {"run_status": "completed"},
                "created_at": "2026-08-06T00:00:00Z",
            },
        ],
    }


def test_session_list_and_mutations_return_authoritative_summary_fields() -> None:
    client, _ = make_client()

    listed = client.get("/v1/sessions")
    updated = client.patch(
        f"/v1/sessions/{SESSION_ID}",
        json={
            "context": {
                "task_manifest": {
                    "schema_version": 1,
                    "task_type": "grading.question",
                    "context": {"contest_id": "contest-1", "question_id": "q-1"},
                }
            },
            "context_mode": "merge",
        },
    )
    replaced = client.patch(
        f"/v1/sessions/{SESSION_ID}",
        json={"context": {"locale": "en"}, "context_mode": "replace"},
    )
    cleared = client.post(f"/v1/sessions/{SESSION_ID}/clear")

    assert listed.json()["results"][0] == {
        "session_id": str(SESSION_ID),
        "title": "New chat",
        "context": {"course_id": 7},
        "created_at": "2026-08-06T00:00:00Z",
        "updated_at": "2026-08-06T00:00:00Z",
        "message_count": 2,
    }
    assert updated.status_code == 200
    assert updated.json()["context"] == {
        "course_id": 7,
        "task_manifest": {
            "schema_version": 1,
            "task_type": "grading.question",
            "context": {"contest_id": "contest-1", "question_id": "q-1"},
        },
    }
    assert updated.json()["created_at"] == "2026-08-06T00:00:00Z"
    assert updated.json()["updated_at"] == "2026-08-06T00:01:00Z"
    assert updated.json()["message_count"] == 2
    assert replaced.json()["context"] == {"locale": "en"}
    assert cleared.json()["created_at"] == "2026-08-06T00:00:00Z"
    assert cleared.json()["updated_at"] == "2026-08-06T00:02:00Z"
    assert cleared.json()["message_count"] == 0


def test_session_update_requires_a_title_or_context() -> None:
    client, _ = make_client()

    response = client.patch(f"/v1/sessions/{SESSION_ID}", json={})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "model_id",
    ["invented-model", "deepseek-v4", "deepseek-v4-thinking"],
)
def test_invalid_model_is_rejected_before_command_service(model_id: str) -> None:
    client, runs = make_client()

    invalid_model = client.post(
        f"/v1/sessions/{SESSION_ID}/runs",
        headers={"Idempotency-Key": "unknown-model"},
        json={"message": "hello", "model_id": model_id},
    )

    assert invalid_model.status_code == 422
    assert invalid_model.json()["error"]["code"] == "VALIDATION_ERROR"
    assert runs.start_token is None


def test_invalid_approval_is_rejected_before_command_service() -> None:
    client, runs = make_client()

    invalid_decision = client.post(
        f"/v1/runs/{RUN_ID}/approve",
        json={"decision": "maybe"},
    )

    assert invalid_decision.status_code == 422
    assert invalid_decision.json()["error"]["code"] == "VALIDATION_ERROR"
    assert runs.approval_calls == 0


def test_every_error_has_stable_envelope_and_echoed_request_id() -> None:
    client, _ = make_client()
    response = client.get(
        f"/v1/runs/{uuid4()}", headers={"X-Request-ID": "request-from-gateway"}
    )
    assert response.status_code == 404
    assert response.headers["X-Request-ID"] == "request-from-gateway"
    assert response.json() == {
        "error": {
            "code": "RUN_NOT_FOUND",
            "message": "Run was not found.",
            "retryable": False,
            "request_id": "request-from-gateway",
        }
    }


def test_usage_and_models_never_expose_price_cost_or_credit() -> None:
    client, _ = make_client()
    usage = client.get("/v1/usage")
    assert usage.status_code == 200
    assert usage.json() == {
        "total_input_tokens": 13,
        "total_output_tokens": 8,
        "total_runs": 2,
        "updated_at": "2026-08-06T00:00:00Z",
    }
    models = client.get("/v1/models")
    assert models.status_code == 200
    assert [model["model_id"] for model in models.json()["models"]] == [
        "openai-nano",
        "openai-mini",
        "openai-mini-medium",
        "deepseek-v4-flash",
        "deepseek-v4-pro",
    ]
    forbidden = {"price", "pricing", "cost", "credits", "entitlement"}
    assert all(forbidden.isdisjoint(model) for model in models.json()["models"])


def test_health_is_public_and_artifacts_are_owner_scoped() -> None:
    client, _ = make_client()
    assert client.get("/health/live").json() == {"status": "ok"}
    assert client.get("/health/ready").status_code == 200
    metadata = client.get(f"/v1/artifacts/{ARTIFACT_ID}")
    assert metadata.status_code == 200
    assert metadata.json()["artifact_id"] == str(ARTIFACT_ID)
    content = client.get(f"/v1/artifacts/{ARTIFACT_ID}/content")
    assert content.content == b"hello"
    assert content.headers["content-type"] == "application/octet-stream"
    assert content.headers["content-disposition"].startswith("attachment;")
    assert content.headers["x-content-type-options"] == "nosniff"
    download = client.get(
        f"/v1/artifacts/{ARTIFACT_ID}/download", follow_redirects=False
    )
    assert download.status_code == 307
    assert download.headers["location"] == "https://objects.test/answer.txt"


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [("payload.html", "text/html"), ("payload.svg", "image/svg+xml")],
)
def test_active_artifact_content_is_forced_to_safe_download(
    filename: str, content_type: str
) -> None:
    client, _ = make_client()

    class ActiveContentArtifacts(FakeArtifactService):
        def __init__(self) -> None:
            super().__init__()
            self.artifact = replace(
                self.artifact,
                filename=filename,
                content_type=content_type,
            )

    client.app.dependency_overrides[get_artifact_service] = ActiveContentArtifacts
    response = client.get(f"/v1/artifacts/{ARTIFACT_ID}/content")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.headers["x-content-type-options"] == "nosniff"


def test_artifact_create_rejects_invalid_mime_syntax() -> None:
    client, _ = make_client()
    response = client.post(
        "/v1/artifacts",
        json={
            "session_id": str(SESSION_ID),
            "step": "output",
            "filename": "bad.bin",
            "content_type": "text/html\r\nX-Evil: yes",
            "content_base64": "aGVsbG8=",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_readiness_failure_uses_the_request_correlation_id() -> None:
    client, _ = make_client()

    class NotReady:
        async def check(self):
            return {"database": "not_ready", "queue": "ready", "settings": "ready"}

    client.app.dependency_overrides[get_readiness_probe] = NotReady
    response = client.get("/health/ready", headers={"X-Request-ID": "ready-request"})
    assert response.status_code == 503
    assert response.json()["error"]["request_id"] == "ready-request"


@pytest.mark.asyncio
async def test_api_readiness_does_not_require_worker_provider_credentials() -> None:
    class HealthyConnection:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def execute(self, statement):
            return None

    class HealthyEngine:
        def connect(self):
            return HealthyConnection()

    class HealthyRedis:
        async def ping(self):
            return True

    base = {
        "AI_DATABASE_URL": "postgresql://qjudge_ai@db/ai",
        "AI_DB_USER": "qjudge_ai",
        "AI_DB_NAME": "ai",
        "ai_redis_url": "redis://queue/2",
        "credential_lease_secret": "x" * 32,
    }
    api_settings = Settings(_env_file=None, **base)
    probe = _ReadinessProbe(
        engine=HealthyEngine(),
        redis=HealthyRedis(),
        settings=api_settings,
        oauth_issuer="https://issuer.test",
        oauth_jwks_url="https://issuer.test/jwks",
    )

    ready_checks = await probe.check()

    assert set(ready_checks.values()) == {"ready"}
    assert "providers" not in ready_checks


def test_unknown_exception_does_not_leak_internal_details() -> None:
    client, _ = make_client()

    class ExplodingUsage:
        async def get_usage_summary(self, principal):
            raise RuntimeError("database-password=secret")

    client.app.dependency_overrides[get_usage_service] = ExplodingUsage
    with TestClient(client.app, raise_server_exceptions=False) as safe_client:
        response = safe_client.get(
            "/v1/usage",
            headers={
                "X-Request-ID": "exploding-request",
                "traceparent": "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
            },
        )
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert response.headers["X-Request-ID"] == "exploding-request"
    assert response.headers["traceparent"] == (
        "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01"
    )
    assert "database-password" not in response.text


def test_legacy_shared_secret_and_chat_routes_are_removed() -> None:
    client, _ = make_client()
    removed = client.post("/api/chat/stream", headers={"X-AI-Internal-Token": "old"})
    assert removed.status_code == 404
    assert removed.json()["error"]["code"] == "HTTP_NOT_FOUND"
    assert client.get("/api/models").status_code == 404
