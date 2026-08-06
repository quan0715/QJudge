from __future__ import annotations

import json
import base64
from collections import deque
from types import SimpleNamespace

import httpx
import pytest
from rest_framework.test import APIClient

from apps.ai.services.ai_service_client import AIServiceClient


SESSION_ID = "11111111-1111-1111-1111-111111111111"
RUN_ID = "22222222-2222-2222-2222-222222222222"
ARTIFACT_ID = "33333333-3333-3333-3333-333333333333"


class ChunkStream(httpx.SyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks

    def __iter__(self):
        yield from self._chunks


class AITransport:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self._responses: deque[tuple[int, object, dict[str, str]]] = deque()
        self.client = AIServiceClient(transport=httpx.MockTransport(self._handle))

    def respond_json(
        self,
        status_code: int,
        payload: object,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        self._responses.append((status_code, payload, headers or {}))

    def respond_stream(
        self,
        status_code: int,
        chunks: list[bytes],
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        self._responses.append((status_code, chunks, headers or {}))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        status_code, payload, headers = self._responses.popleft()
        if isinstance(payload, list):
            return httpx.Response(
                status_code,
                stream=ChunkStream(payload),
                headers=headers,
            )
        return httpx.Response(status_code, json=payload, headers=headers)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def teacher():
    return SimpleNamespace(pk=17, id=17, is_authenticated=True, role="teacher")


@pytest.fixture
def student():
    return SimpleNamespace(pk=18, id=18, is_authenticated=True, role="student")


@pytest.fixture
def ai_transport(monkeypatch) -> AITransport:
    transport = AITransport()
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda user, audience, scopes, lifetime_seconds: (
            f"signed-{user.pk}-{audience}-{','.join(sorted(scopes))}-{lifetime_seconds}"
        ),
    )
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: transport.client)
    monkeypatch.setattr(
        "apps.ai.artifact_views.get_ai_service_client", lambda: transport.client
    )
    return transport


def _run_payload(status: str = "queued") -> dict[str, object]:
    return {
        "run_id": RUN_ID,
        "session_id": SESSION_ID,
        "status": status,
        "kind": "chat",
        "model_id": "deepseek-v4",
        "last_sequence": 0,
        "cancel_requested": False,
        "error_code": None,
        "error_message": None,
        "pause_payload": {},
        "input_tokens": 0,
        "output_tokens": 0,
    }


def test_create_run_maps_path_token_body_and_idempotency(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_json(202, _run_payload())
    api_client.force_authenticate(teacher)

    response = api_client.post(
        f"/api/v1/ai/sessions/{SESSION_ID}/runs/",
        {"content": "hello", "model_id": "deepseek-v4"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="message-1",
        HTTP_X_REQUEST_ID="request-1",
        HTTP_TRACEPARENT="00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    )

    upstream = ai_transport.requests[0]
    assert upstream.url.path == f"/v1/sessions/{SESSION_ID}/runs"
    assert upstream.headers["authorization"] == (
        "Bearer signed-17-ai-service-ai:chat-300"
    )
    assert upstream.headers["idempotency-key"] == "message-1"
    assert upstream.headers["x-request-id"] == "request-1"
    assert upstream.headers["traceparent"].startswith("00-aaaa")
    assert json.loads(upstream.content) == {
        "message": "hello",
        "model_id": "deepseek-v4",
    }
    assert response.status_code == 202
    assert response.json()["id"] == RUN_ID
    assert response.json()["last_event_seq"] == 0


def test_task_manifest_context_is_forwarded_without_django_state(
    api_client, teacher, ai_transport
) -> None:
    created_at = "2026-08-05T03:04:05Z"
    updated_at = "2026-08-06T03:04:05Z"
    manifest = {
        "schema_version": 1,
        "task_type": "grading.question",
        "context": {"contest_id": "contest-1", "question_id": "question-1"},
        "prompt": "Grade this question",
    }
    ai_transport.respond_json(
        200,
        {
            "session_id": SESSION_ID,
            "title": "New chat",
            "context": {"course_id": "course-1", "task_manifest": manifest},
            "created_at": created_at,
            "updated_at": updated_at,
            "message_count": 4,
        },
    )
    api_client.force_authenticate(teacher)

    response = api_client.patch(
        f"/api/v1/ai/sessions/{SESSION_ID}/",
        {"context": {"task_manifest": manifest}},
        format="json",
    )

    assert response.status_code == 200
    upstream = ai_transport.requests[0]
    assert upstream.url.path == f"/v1/sessions/{SESSION_ID}"
    assert json.loads(upstream.content) == {
        "context": {"task_manifest": manifest},
        "context_mode": "merge",
    }
    assert response.json()["context"]["task_manifest"] == manifest
    assert response.json()["created_at"] == created_at
    assert response.json()["updated_at"] == updated_at
    assert response.json()["message_count"] == 4


def test_session_list_preserves_ai_owned_timestamps_and_message_count(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_json(
        200,
        {
            "count": 1,
            "next": None,
            "previous": None,
            "results": [
                {
                    "session_id": SESSION_ID,
                    "title": "Newest",
                    "context": {},
                    "created_at": "2026-08-05T01:02:03Z",
                    "updated_at": "2026-08-06T04:05:06Z",
                    "message_count": 11,
                }
            ],
        },
    )
    api_client.force_authenticate(teacher)

    response = api_client.get("/api/v1/ai/sessions/")

    assert response.json()["results"][0]["created_at"] == "2026-08-05T01:02:03Z"
    assert response.json()["results"][0]["updated_at"] == "2026-08-06T04:05:06Z"
    assert response.json()["results"][0]["message_count"] == 11


def test_session_create_and_clear_preserve_ai_owned_summary_fields(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_json(
        201,
        {
            "session_id": SESSION_ID,
            "title": "New chat",
            "context": {"course_id": "course-1"},
            "created_at": "2026-08-05T01:02:03Z",
            "updated_at": "2026-08-05T01:02:03Z",
            "message_count": 0,
        },
    )
    ai_transport.respond_json(
        200,
        {
            "session_id": SESSION_ID,
            "title": "New chat",
            "context": {"course_id": "course-1"},
            "created_at": "2026-08-05T01:02:03Z",
            "updated_at": "2026-08-06T04:05:06Z",
            "message_count": 0,
        },
    )
    api_client.force_authenticate(teacher)

    created = api_client.post(
        "/api/v1/ai/sessions/",
        {"context": {"course_id": "course-1"}},
        format="json",
    )
    cleared = api_client.post(f"/api/v1/ai/sessions/{SESSION_ID}/clear/")

    assert created.status_code == 201
    assert created.json()["created_at"] == "2026-08-05T01:02:03Z"
    assert created.json()["message_count"] == 0
    assert cleared.status_code == 200
    assert cleared.json()["updated_at"] == "2026-08-06T04:05:06Z"
    assert cleared.json()["message_count"] == 0


@pytest.mark.parametrize(
    ("method", "legacy_path", "upstream_path", "upstream_status", "payload"),
    [
        (
            "get",
            "/api/v1/ai/sessions/",
            "/v1/sessions",
            200,
            {"count": 0, "next": None, "previous": None, "results": []},
        ),
        (
            "post",
            "/api/v1/ai/sessions/new_session/",
            "/v1/sessions",
            201,
            {
                "session_id": SESSION_ID,
                "title": "New chat",
                "context": {},
                "created_at": "2026-08-05T00:00:00Z",
                "updated_at": "2026-08-05T00:00:00Z",
                "message_count": 0,
            },
        ),
        (
            "get",
            f"/api/v1/ai/sessions/{SESSION_ID}/",
            f"/v1/sessions/{SESSION_ID}",
            200,
            {
                "session_id": SESSION_ID,
                "title": "Chat",
                "context": {},
                "created_at": "2026-08-05T00:00:00Z",
                "updated_at": "2026-08-05T00:00:00Z",
                "message_count": 0,
                "messages": [],
            },
        ),
        (
            "post",
            f"/api/v1/ai/sessions/{SESSION_ID}/rename/",
            f"/v1/sessions/{SESSION_ID}",
            200,
            {
                "session_id": SESSION_ID,
                "title": "Renamed",
                "context": {},
                "created_at": "2026-08-05T00:00:00Z",
                "updated_at": "2026-08-05T01:00:00Z",
                "message_count": 0,
            },
        ),
        (
            "post",
            f"/api/v1/ai/sessions/{SESSION_ID}/clear/",
            f"/v1/sessions/{SESSION_ID}/clear",
            200,
            {
                "session_id": SESSION_ID,
                "title": "Chat",
                "context": {},
                "created_at": "2026-08-05T00:00:00Z",
                "updated_at": "2026-08-05T02:00:00Z",
                "message_count": 0,
            },
        ),
        (
            "delete",
            f"/api/v1/ai/sessions/{SESSION_ID}/",
            f"/v1/sessions/{SESSION_ID}",
            204,
            None,
        ),
        (
            "get",
            "/api/v1/ai/runs/?status=active",
            "/v1/runs",
            200,
            {"count": 0, "next": None, "previous": None, "results": []},
        ),
        (
            "get",
            f"/api/v1/ai/runs/{RUN_ID}/",
            f"/v1/runs/{RUN_ID}",
            200,
            _run_payload(),
        ),
        (
            "post",
            f"/api/v1/ai/runs/{RUN_ID}/cancel/",
            f"/v1/runs/{RUN_ID}/cancel",
            200,
            _run_payload("cancelled"),
        ),
        (
            "post",
            f"/api/v1/ai/runs/{RUN_ID}/approval/",
            f"/v1/runs/{RUN_ID}/approve",
            200,
            _run_payload("running"),
        ),
        (
            "post",
            f"/api/v1/ai/runs/{RUN_ID}/answer/",
            f"/v1/runs/{RUN_ID}/answer",
            200,
            _run_payload("running"),
        ),
        ("get", "/api/v1/ai/models/", "/v1/models", 200, {"models": []}),
    ],
)
def test_legacy_routes_delegate_to_canonical_ai_service(
    api_client,
    teacher,
    ai_transport,
    method,
    legacy_path,
    upstream_path,
    upstream_status,
    payload,
) -> None:
    ai_transport.respond_json(upstream_status, payload)
    api_client.force_authenticate(teacher)
    body = None
    if legacy_path.endswith("rename/"):
        body = {"title": "Renamed"}
    elif legacy_path.endswith("approval/"):
        body = {"decision": "approve"}
    elif legacy_path.endswith("answer/"):
        body = {"answer": "yes"}

    response = getattr(api_client, method)(legacy_path, body, format="json")

    expected_status = 200 if legacy_path.endswith("new_session/") else upstream_status
    assert response.status_code == expected_status
    assert ai_transport.requests[0].url.path == upstream_path


def test_upstream_error_preserves_safe_contract_fields(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_json(
        503,
        {
            "error": {
                "code": "MCP_UNAVAILABLE",
                "message": "AI tools are unavailable.",
                "retryable": True,
                "request_id": "upstream-request",
                "secret": "must-not-pass",
            }
        },
    )
    api_client.force_authenticate(teacher)

    response = api_client.post(f"/api/v1/ai/runs/{RUN_ID}/cancel/", {}, format="json")

    assert response.status_code == 503
    assert response.json() == {
        "success": False,
        "error": {
            "code": "MCP_UNAVAILABLE",
            "message": "AI tools are unavailable.",
            "retryable": True,
            "request_id": "upstream-request",
        },
    }


def test_transport_failure_returns_stable_unavailable_error(
    api_client, teacher, monkeypatch
) -> None:
    attempts = 0

    def fail(_request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ConnectError("contains-secret-host", request=_request)

    client = AIServiceClient(transport=httpx.MockTransport(fail))
    monkeypatch.setattr("apps.ai.views.get_ai_service_client", lambda: client)
    monkeypatch.setattr(
        "apps.ai.services.ai_service_client.issue_resource_token",
        lambda *args, **kwargs: "signed-token",
    )
    api_client.force_authenticate(teacher)

    response = api_client.post(
        f"/api/v1/ai/runs/{RUN_ID}/cancel/",
        {},
        format="json",
        HTTP_X_REQUEST_ID="request-2",
    )

    assert response.status_code == 503
    assert response.json() == {
        "success": False,
        "error": {
            "code": "AI_SERVICE_UNAVAILABLE",
            "message": "AI Service is temporarily unavailable.",
            "retryable": True,
            "request_id": "request-2",
        },
    }
    assert attempts == 1


def test_malformed_success_payload_returns_stable_invalid_response(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_json(200, {"title": "missing required session id"})
    api_client.force_authenticate(teacher)

    response = api_client.get(f"/api/v1/ai/sessions/{SESSION_ID}/")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "AI_SERVICE_INVALID_RESPONSE"


def _artifact_payload() -> dict[str, object]:
    return {
        "artifact_id": ARTIFACT_ID,
        "session_id": SESSION_ID,
        "produced_by_run_id": None,
        "step": "user_upload",
        "filename": "notes.md",
        "content_type": "text/markdown",
        "size_bytes": 5,
        "checksum": "sha256:abc",
        "metadata": {"source": "composer_upload"},
        "created_at": "2026-08-05T00:00:00Z",
        "updated_at": "2026-08-05T00:00:00Z",
    }


def test_artifact_list_maps_canonical_metadata(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_json(
        200,
        {"count": 1, "next": None, "previous": None, "results": [_artifact_payload()]},
    )
    api_client.force_authenticate(teacher)

    response = api_client.get(
        f"/api/v1/ai/artifacts/?session_id={SESSION_ID}&step=user_upload"
    )

    upstream = ai_transport.requests[0]
    assert upstream.url.path == "/v1/artifacts"
    assert dict(upstream.url.params) == {
        "session_id": SESSION_ID,
        "step": "user_upload",
    }
    assert response.json()["results"][0]["id"] == ARTIFACT_ID
    assert "object_key" not in response.json()["results"][0]


def test_artifact_upload_converts_multipart_to_canonical_content(
    api_client, teacher, ai_transport
) -> None:
    from django.core.files.uploadedfile import SimpleUploadedFile

    ai_transport.respond_json(201, _artifact_payload())
    api_client.force_authenticate(teacher)

    response = api_client.post(
        "/api/v1/ai/artifacts/upload/",
        {
            "session_id": SESSION_ID,
            "step": "user_upload",
            "file": SimpleUploadedFile(
                "notes.md", b"hello", content_type="text/markdown"
            ),
        },
        format="multipart",
    )

    upstream = ai_transport.requests[0]
    assert upstream.url.path == "/v1/artifacts"
    assert json.loads(upstream.content) == {
        "session_id": SESSION_ID,
        "produced_by_run_id": None,
        "step": "user_upload",
        "filename": "notes.md",
        "content_type": "text/markdown",
        "content_base64": base64.b64encode(b"hello").decode("ascii"),
        "metadata": {
            "artifact_type": "user_upload",
            "source": "composer_upload",
        },
    }
    assert response.status_code == 201
    assert response.json()["id"] == ARTIFACT_ID


def test_artifact_upload_normalizes_client_mime_from_supported_extension(
    api_client, teacher, ai_transport
) -> None:
    from django.core.files.uploadedfile import SimpleUploadedFile

    ai_transport.respond_json(201, _artifact_payload())
    api_client.force_authenticate(teacher)

    response = api_client.post(
        "/api/v1/ai/artifacts/upload/",
        {
            "session_id": SESSION_ID,
            "file": SimpleUploadedFile("notes.md", b"hello", content_type="text/html"),
        },
        format="multipart",
    )

    assert response.status_code == 201
    assert (
        json.loads(ai_transport.requests[0].content)["content_type"] == "text/markdown"
    )


def test_artifact_content_and_download_preserve_legacy_consumers(
    api_client, teacher, ai_transport
) -> None:
    ai_transport.respond_stream(
        200,
        [b"hello"],
        headers={
            "Content-Type": "application/octet-stream",
            "Content-Disposition": "attachment; filename=notes.md",
            "X-Content-Type-Options": "nosniff",
        },
    )
    ai_transport.respond_json(
        307,
        {},
        headers={"Location": "https://objects.example/artifact?signature=safe"},
    )
    api_client.force_authenticate(teacher)

    content = api_client.get(f"/api/v1/ai/artifacts/{ARTIFACT_ID}/content/")
    download = api_client.get(f"/api/v1/ai/artifacts/{ARTIFACT_ID}/download/")

    assert content.content == b"hello"
    assert content["Content-Disposition"] == "attachment; filename=notes.md"
    assert download.status_code == 200
    assert download.json()["url"] == "https://objects.example/artifact?signature=safe"
    assert ai_transport.requests[0].url.path == f"/v1/artifacts/{ARTIFACT_ID}/content"
    assert ai_transport.requests[1].url.path == f"/v1/artifacts/{ARTIFACT_ID}/download"
