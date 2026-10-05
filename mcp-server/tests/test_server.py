import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def reset_shared_http_client():
    server._HTTP_CLIENT = None
    yield
    server._HTTP_CLIENT = None


def test_oauth_config_canonicalizes_trailing_slash():
    environment = os.environ.copy()
    environment["QJUDGE_PUBLIC_ORIGIN"] = "https://issuer.test/"

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import config; print(config.OAUTH_ISSUER_URL)",
        ],
        cwd=ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.strip() == "https://issuer.test"


class DummyRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


class DummyRequestContext:
    def __init__(self, headers=None):
        self.request = DummyRequest(headers=headers)


class DummyContext:
    def __init__(self, headers=None):
        self.request_context = DummyRequestContext(headers=headers)


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakeAsyncClient:
    def __init__(self, response, recorder, timeout=None):
        self._response = response
        self._recorder = recorder
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def request(self, **kwargs):
        self._recorder.append(kwargs)
        return self._response

    async def get(self, url, **kwargs):
        self._recorder.append({"url": url, **kwargs})
        return self._response


class StaticJwksClient:
    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return type("SigningKey", (), {"key": self._public_key})()


class RecordingFallback:
    def __init__(self, result=None):
        self._result = result
        self.tokens = []

    async def verify_token(self, token):
        self.tokens.append(token)
        return self._result


class FailingFallback:
    async def verify_token(self, token):
        raise AssertionError("JWT verification must not call the opaque fallback")


def contest_detail(*, contest_id="11111111-1111-1111-1111-111111111111", contest_type="paper_exam"):
    return {
        "id": contest_id,
        "contest_type": contest_type,
    }


def test_django_api_forwards_auth_header_and_json_body(monkeypatch):
    calls = []
    response = FakeResponse(200, payload={"ok": True})

    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )

    ctx = DummyContext(headers={"authorization": "Bearer token"})
    result = run(
        server.django_api(
            "POST",
            "/api/v1/demo/",
            ctx,
            json_body={"hello": "world"},
        )
    )

    assert result == {"ok": True}
    assert calls == [{
        "method": "POST",
        "url": f"{server.DJANGO_BASE_URL}/api/v1/demo/",
        "headers": {"X-Forwarded-Proto": server.DJANGO_FORWARDED_PROTO, "Authorization": "Bearer token"},
        "json": {"hello": "world"},
        "timeout": 30.0,
    }]


def test_django_api_returns_success_for_204(monkeypatch):
    calls = []
    response = FakeResponse(204)
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )

    result = run(server.django_api("DELETE", "/api/v1/demo/", DummyContext()))

    assert result == {"status": "success"}


def test_django_api_maps_httpx_connect_error_to_error_dict(monkeypatch):
    """Uncaught httpx errors become FastMCP ToolError with empty str(e); django_api must not raise."""

    class RaisingClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def request(self, **kwargs):
            raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(server.httpx, "AsyncClient", RaisingClient)

    result = run(server.django_api("GET", "/api/v1/demo/", DummyContext()))

    assert result["error"] is True
    assert "connection refused" in result["detail"]
    assert result.get("status") == 502


def test_django_api_wraps_json_error_payload(monkeypatch):
    response = FakeResponse(400, payload={"message": "bad request"})
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, [], timeout=timeout),
    )

    result = run(server.django_api("GET", "/api/v1/demo/", DummyContext()))

    assert result == {
        "error": True,
        "errors": ["message: bad request"],
        "status": 400,
    }


def test_django_api_wraps_non_json_error_payload(monkeypatch):
    response = FakeResponse(502, payload=ValueError("boom"), text="upstream failed")
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, [], timeout=timeout),
    )

    result = run(server.django_api("GET", "/api/v1/demo/", DummyContext()))

    assert result == {
        "error": True,
        "errors": ["raw: upstream failed"],
        "status": 502,
    }


def test_django_api_handles_custom_exception_handler_format(monkeypatch):
    """Django's custom_exception_handler wraps errors as {success: false, error: {message, details}}."""
    payload = {
        "success": False,
        "error": {
            "code": "INVALID",
            "message": "Validation failed",
            "details": {
                "title": ["This field is required."],
                "test_cases": ["weight_percent total must equal 100"],
            },
        },
    }
    response = FakeResponse(400, payload=payload)
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, [], timeout=timeout),
    )

    result = run(server.django_api("POST", "/api/v1/demo/", DummyContext()))

    assert result["error"] is True
    assert result["status"] == 400
    assert "title: This field is required." in result["errors"]
    assert "test_cases: weight_percent total must equal 100" in result["errors"]


def test_django_api_handles_custom_exception_handler_message_only(monkeypatch):
    """Custom exception handler with message but no field-level details."""
    payload = {
        "success": False,
        "error": {
            "code": "PERMISSION_DENIED",
            "message": "You do not have permission to perform this action.",
        },
    }
    response = FakeResponse(403, payload=payload)
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, [], timeout=timeout),
    )

    result = run(server.django_api("GET", "/api/v1/demo/", DummyContext()))

    assert result["error"] is True
    assert result["status"] == 403
    assert result["errors"] == ["You do not have permission to perform this action."]


def test_qjudge_browse_builds_encoded_query(monkeypatch):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        calls.append({
            "method": method,
            "path": path,
            "json_body": json_body,
        })
        return {"items": []}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_browse(
            "list_classrooms",
            DummyContext(),
            search="algo & ds",
        )
    )

    assert result == {"count": 0, "items": []}
    assert calls[0] == {
        "method": "GET",
        "path": "/api/v1/classrooms/?scope=manage&search=algo+%26+ds",
        "json_body": None,
    }


def test_qjudge_contest_manager_reorder_exam_generates_orders(monkeypatch):
    captured = {}
    contest_uuid = "11111111-1111-1111-1111-111111111111"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == f"/api/v1/contests/{contest_uuid}/":
            return contest_detail(contest_id=contest_uuid)
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"status": "success"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_contest_manager(
            "reorder",
            DummyContext(),
            contest_id=contest_uuid,
            question_ids=["q3", "q1", "q2"],
        )
    )

    assert result == {"status": "success"}
    assert captured == {
        "method": "POST",
        "path": f"/api/v1/contests/{contest_uuid}/exam-questions/reorder/",
        "json_body": {
            "orders": [
                {"id": "q3", "order": 0},
                {"id": "q1", "order": 1},
                {"id": "q2", "order": 2},
            ]
        },
    }


def test_qjudge_contest_manager_reorder_coding(monkeypatch):
    captured = {}
    contest_uuid = "22222222-2222-2222-2222-222222222222"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == f"/api/v1/contests/{contest_uuid}/":
            return contest_detail(contest_id=contest_uuid, contest_type="coding")
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"status": "reordered"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_contest_manager(
            "reorder",
            DummyContext(),
            contest_id=contest_uuid,
            question_ids=["p1", "p2"],
        )
    )

    assert result == {"status": "reordered"}
    assert captured == {
        "method": "POST",
        "path": f"/api/v1/contests/{contest_uuid}/problems/reorder/",
        "json_body": {
            "orders": [
                {"id": "p1", "order": 0},
                {"id": "p2", "order": 1},
            ]
        },
    }


def test_verify_token_uses_canonical_users_me_path(monkeypatch):
    calls = []
    response = FakeResponse(200, payload={"id": "user-1"})
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )

    token = run(server.DjangoTokenVerifier().verify_token("token-123"))

    assert token is not None
    assert token.token == "token-123"
    assert calls == [{
        "url": f"{server.DJANGO_BASE_URL}/api/v1/users/me",
        "headers": {
            "Authorization": "Bearer token-123",
            "X-Forwarded-Proto": server.DJANGO_FORWARDED_PROTO,
        },
        "timeout": 10.0,
    }]


def test_verify_token_caches_successful_checks(monkeypatch):
    calls = []
    response = FakeResponse(200, payload={"id": "user-1"})
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )
    verifier = server.DjangoTokenVerifier()

    async def verify_twice():
        return await verifier.verify_token("token-123"), await verifier.verify_token("token-123")

    first, second = run(verify_twice())

    assert first is not None and second is not None
    assert len(calls) == 1


def test_verify_token_does_not_cache_rejections(monkeypatch):
    calls = []
    response = FakeResponse(401, payload={})
    monkeypatch.setattr(
        server.httpx,
        "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )
    verifier = server.DjangoTokenVerifier()

    async def verify_twice():
        return await verifier.verify_token("bad"), await verifier.verify_token("bad")

    assert run(verify_twice()) == (None, None)
    assert len(calls) == 2


def test_qjudge_exam_returns_fixed_errors():
    missing_question = run(server.qjudge_exam("get", "11111111-1111-1111-1111-111111111111", DummyContext()))
    no_update_fields = run(
        server.qjudge_exam(
            "update",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_id="q1",
        )
    )

    assert missing_question["error"] is True
    assert missing_question["detail"].startswith("question_id is required")
    assert no_update_fields["error"] is True
    assert no_update_fields["detail"].startswith("No fields to update")


def test_qjudge_grading_list_answers_returns_compact_projection(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        return [{
            "id": "ans-1",
            "question_id": "q-1",
            "question_prompt": "Long prompt",
            "question_type": "essay",
            "question_options": ["A", "B"],
            "max_score": 10,
            "answer": {"text": "hello"},
            "is_correct": None,
            "score": 7,
            "feedback": "ok",
            "participant_user_id": 99,
            "participant_username": "alice",
            "participant_nickname": "Alice",
            "created_at": "x",
            "updated_at": "y",
            "graded_at": "z",
        }]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_grading(
            "list_answers",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_id="q-1",
        )
    )

    assert result == {
        "count": 1,
        "items": [{
            "exam_answer_id": "ans-1",
            "question_id": "q-1",
            "question_prompt": "Long prompt",
            "question_type": "essay",
            "max_score": 10,
            "participant_id": 99,
            "username": "alice",
            "display_name": "Alice",
            "answer": {"text": "hello"},
            "is_correct": None,
            "score": 7,
            "feedback": "ok",
            "graded_at": "z",
        }],
    }


def test_qjudge_grading_list_answers_grading_projection(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        return [{
            "id": "ans-1",
            "question_id": "q-1",
            "question_prompt": "Long prompt",
            "question_type": "essay",
            "max_score": 10,
            "answer": {"text": "hello"},
            "is_correct": None,
            "score": 7,
            "feedback": "第2點需再補充",
            "participant_user_id": 99,
            "participant_username": "alice",
            "participant_nickname": "Alice",
            "graded_at": "z",
        }]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_grading(
            "list_answers",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_id="q-1",
            projection="grading",
        )
    )

    assert result == {
        "count": 1,
        "items": [{
            "index": 1,
            "exam_answer_id": "ans-1",
            "username": "alice",
            "answer_text": "hello",
            "original_score": 7,
            "original_feedback": "第2點需再補充",
        }],
    }


def test_qjudge_grading_question_detail_strips_participants_and_omitted_by_default(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        return {
            "question_id": "q-1",
            "responses": [{
                "exam_answer_id": "ans-1",
                "question_prompt": "Current prompt",
                "answer": {"text": "hello"},
            }],
            "option_distribution": [{
                "label": "A. Option",
                "count": 1,
                "participants": [{"participant_id": 1}],
            }],
            "omitted_count": 1,
            "omitted_participants": [{"participant_id": 2}],
        }

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_grading("question_detail", "11111111-1111-1111-1111-111111111111", DummyContext(), question_id="q-1"))

    assert result == {
        "question_id": "q-1",
        "responses": [{
            "exam_answer_id": "ans-1",
            "question_prompt": "Current prompt",
            "answer": {"text": "hello"},
        }],
        "option_distribution": [{
            "label": "A. Option",
            "count": 1,
        }],
        "omitted_count": 1,
    }


def test_qjudge_grading_dashboard_truncates_titles(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        return {
            "questions": [{
                "question_id": "q-1",
                "title": "x" * 130,
            }]
        }

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_grading("dashboard", "11111111-1111-1111-1111-111111111111", DummyContext()))

    assert len(result["questions"][0]["title"]) == 120
    assert result["questions"][0]["title"].endswith("…")


def test_qjudge_grading_grade_and_batch_grade_return_minimal_ack(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path.endswith("/batch-grade/"):
            return {
                "results": [
                    {"exam_answer_id": "1", "status": "ok"},
                    {"exam_answer_id": "2", "status": "error"},
                ],
                "graded_count": 1,
            }
        return {
            "id": "ans-1",
            "score": 8,
            "feedback": "ok",
        }

    monkeypatch.setattr(server, "django_api", fake_django_api)

    grade_result = run(
        server.qjudge_grading(
            "grade",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            exam_answer_id="ans-1",
            score=8,
        )
    )
    batch_result = run(
        server.qjudge_grading(
            "batch_grade",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            grades=[{"exam_answer_id": "1", "score": 8}],
        )
    )

    assert grade_result == {
        "status": "success",
        "exam_answer_id": "ans-1",
        "score": 8,
    }
    assert batch_result == {
        "status": "partial",
        "graded_count": 1,
        "error_count": 1,
        "errors": [{"exam_answer_id": "2", "status": "error"}],
    }


@pytest.mark.parametrize(
    ("kwargs", "detail"),
    [
        ({"action": "question_detail"}, "question_id is required"),
        ({"action": "grade", "exam_answer_id": None, "score": 5}, "exam_answer_id is required"),
        ({"action": "grade", "exam_answer_id": "ans-1", "score": None}, "score is required"),
        ({"action": "batch_grade", "grades": None}, "grades array is required"),
        ({"action": "ungrade", "exam_answer_id": None}, "exam_answer_id is required"),
    ],
)
def test_qjudge_grading_returns_fixed_errors(kwargs, detail):
    result = run(
        server.qjudge_grading(
            kwargs["action"],
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_id=kwargs.get("question_id"),
            exam_answer_id=kwargs.get("exam_answer_id"),
            score=kwargs.get("score"),
            grades=kwargs.get("grades"),
        )
    )

    assert result["error"] is True
    assert result["detail"].startswith(detail)


def test_qjudge_browse_get_help():
    result = run(server.qjudge_browse("get_help", DummyContext()))
    assert "tools" in result
    assert "common_mistakes" in result
    assert "coding_problem_example" in result
    assert "qjudge_browse" in result["tools"]
    assert "qjudge_contest_manager" in result["tools"]
    assert "qjudge_coding_problems" in result["tools"]


def test_qjudge_browse_get_help_single_tool():
    result = run(server.qjudge_browse("get_help", DummyContext(), tool_name="qjudge_exam"))
    assert result["tool"] == "qjudge_exam"
    assert "summary" in result
    assert "routing_rules" in result


# ---------- qjudge_browse tests ----------




# ---------- qjudge_exam import_from_bank tests ----------


def test_qjudge_exam_import_from_bank(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return [{"id": "eq-1"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    items = [
        {"question_bank_id": "bank-1", "question_id": "q-1"},
        {"question_bank_id": "bank-1", "question_id": "q-2"},
    ]
    result = run(server.qjudge_exam("import_from_bank", "11111111-1111-1111-1111-111111111111", DummyContext(), items=items))

    assert result == [{"id": "eq-1"}]
    assert captured == {
        "method": "POST",
        "path": "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/import-from-bank/",
        "json_body": {"items": items},
    }


def test_qjudge_exam_import_from_bank_requires_items():
    result = run(server.qjudge_exam("import_from_bank", "11111111-1111-1111-1111-111111111111", DummyContext()))
    assert result["error"] is True
    assert "items" in result["detail"]


def test_qjudge_exam_create_passes_explanation(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "eq-new"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_type="essay",
            prompt="Explain CAP theorem.",
            explanation="Consistency, availability, and partition tolerance trade off.",
            score=10,
        )
    )

    assert result == {"id": "eq-new"}
    assert captured == {
        "method": "POST",
        "path": "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/",
        "json_body": {
            "question_type": "essay",
            "prompt": "Explain CAP theorem.",
            "explanation": "Consistency, availability, and partition tolerance trade off.",
            "score": 10,
        },
    }


def test_qjudge_exam_update_passes_explanation(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "eq-1"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "update",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_id="eq-1",
            explanation="Updated explanation",
        )
    )

    assert result == {"id": "eq-1"}
    assert captured == {
        "method": "PATCH",
        "path": "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/eq-1/",
        "json_body": {"explanation": "Updated explanation"},
    }


def test_qjudge_exam_update_passes_existing_grades_action(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        captured["json_body"] = json_body
        return {"id": "eq-1"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_exam(
            "update",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_id="eq-1",
            correct_answer=2,
            existing_grades_action="regrade",
        )
    )

    assert captured["json_body"] == {"correct_answer": 2, "existing_grades_action": "regrade"}


def test_qjudge_exam_correct_answer_schema_advertises_integer_indexes():
    schema = server.mcp._tool_manager.get_tool("qjudge_exam").parameters["properties"]["correct_answer"]

    assert {"type": "integer"} in schema["anyOf"]
    assert {"type": "array", "items": {"type": "integer"}} in schema["anyOf"]


def test_qjudge_exam_create_converts_index_strings_for_objective_questions(monkeypatch):
    bodies = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        bodies.append(json_body)
        return {"id": "eq-new"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_exam(
            "create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_type="single_choice",
            prompt="Pick",
            options=["a", "b"],
            correct_answer="1",
        )
    )
    run(
        server.qjudge_exam(
            "create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_type="short_answer",
            prompt="1 + 0 = ?",
            correct_answer="1",
        )
    )

    assert bodies[0]["correct_answer"] == 1
    assert bodies[1]["correct_answer"] == "1"


def test_qjudge_exam_update_converts_index_string_using_current_question_type(monkeypatch):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        calls.append((method, json_body))
        if method == "GET":
            return {"id": "eq-1", "question_type": "single_choice"}
        return {"id": "eq-1"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_exam(
            "update",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_id="eq-1",
            correct_answer="2",
            existing_grades_action="regrade",
        )
    )

    assert calls == [
        ("GET", None),
        ("PATCH", {"correct_answer": 2, "existing_grades_action": "regrade"}),
    ]


def test_qjudge_exam_batch_create_converts_index_strings(monkeypatch):
    bodies = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        bodies.append(json_body)
        return {"id": f"eq-{len(bodies)}"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_exam(
            "batch_create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            items=[
                {"question_type": "multiple_choice", "prompt": "Pick", "options": ["a", "b", "c"], "correct_answer": ["0", "2"]},
                {"question_type": "true_false", "prompt": "Sky is blue", "options": ["True", "False"], "correct_answer": "0"},
            ],
        )
    )

    assert [body["correct_answer"] for body in bodies] == [[0, 2], 0]


def test_qjudge_exam_rejects_existing_grades_action_outside_update():
    result = run(
        server.qjudge_exam(
            "create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            question_type="single_choice",
            prompt="Pick",
            options=["a", "b"],
            correct_answer=0,
            existing_grades_action="regrade",
        )
    )

    assert result["error"] is True
    assert "existing_grades_action" in result["detail"]


def test_qjudge_exam_batch_create_append(monkeypatch):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        calls.append((method, path, json_body))
        return {"id": f"eq-{len(calls)}"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "batch_create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            mode="append",
            items=[
                {"question_type": "essay", "prompt": "Q1", "explanation": "E1", "score": 5},
                {"question_type": "single_choice", "prompt": "Q2", "options": ["A", "B"], "correct_answer": 0, "score": 3},
            ],
        )
    )

    assert result["status"] == "success"
    assert result["mode"] == "append"
    assert result["deleted_count"] == 0
    assert result["created_count"] == 2
    assert calls == [
        ("POST", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/", {"question_type": "essay", "prompt": "Q1", "explanation": "E1", "score": 5}),
        ("POST", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/", {"question_type": "single_choice", "prompt": "Q2", "score": 3, "options": ["A", "B"], "correct_answer": 0}),
    ]


def test_qjudge_exam_batch_create_overwrite(monkeypatch):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        calls.append((method, path, json_body))
        if method == "GET" and path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/":
            return [{"id": "old-1"}, {"id": "old-2"}]
        if method == "DELETE":
            return {"status": "success"}
        return {"id": f"new-{len(calls)}"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "batch_create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            mode="overwrite",
            items=[{"question_type": "essay", "prompt": "Fresh question", "score": 10}],
        )
    )

    assert result["status"] == "success"
    assert result["mode"] == "overwrite"
    assert result["deleted_count"] == 2
    assert result["created_count"] == 1
    assert calls == [
        ("GET", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/", None),
        ("POST", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/", {"question_type": "essay", "prompt": "Fresh question", "score": 10}),
        ("DELETE", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/old-1/", None),
        ("DELETE", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/old-2/", None),
    ]


def test_qjudge_exam_batch_create_overwrite_keeps_old_questions_when_create_fails(monkeypatch):
    calls = []
    posts = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        calls.append((method, path))
        if method == "GET":
            return [{"id": "old-1"}]
        if method == "POST":
            posts.append(json_body)
            if len(posts) == 2:
                return {"error": True, "errors": ["bad question"], "status": 400}
            return {"id": "new-1"}
        return {"status": "success"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "batch_create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            mode="overwrite",
            items=[
                {"question_type": "essay", "prompt": "Q1"},
                {"question_type": "essay", "prompt": "Q2"},
            ],
        )
    )

    base = "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions"
    assert result["error"] is True
    assert result["rolled_back"] == 1
    assert ("DELETE", f"{base}/old-1/") not in calls
    assert ("DELETE", f"{base}/new-1/") in calls


def test_qjudge_exam_batch_create_rollback_reports_only_successful_cleanups(monkeypatch):
    posts = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        if method == "POST":
            posts.append(json_body)
            if len(posts) == 3:
                return {"error": True, "errors": ["bad"], "status": 400}
            return {"id": f"new-{len(posts)}"}
        if method == "DELETE" and path.endswith("/new-1/"):
            return {"error": True, "errors": ["boom"], "status": 500}
        return {"status": "success"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "batch_create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            items=[{"question_type": "essay", "prompt": f"Q{i}"} for i in range(3)],
        )
    )

    assert result["rolled_back"] == 1
    assert result["rollback_failed_ids"] == ["new-1"]


def test_qjudge_exam_batch_create_validates_items_before_any_write(monkeypatch):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        calls.append((method, path))
        return []

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "batch_create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            mode="overwrite",
            items=[{"question_type": "essay", "prompt": "Q1"}, {"question_type": "essay"}],
        )
    )

    assert result["error"] is True
    assert "items[2]" in result["detail"]
    assert calls == []


def test_qjudge_exam_batch_create_requires_valid_mode():
    result = run(
        server.qjudge_exam(
            "batch_create",
            "11111111-1111-1111-1111-111111111111",
            DummyContext(),
            mode="replace",
            items=[{"question_type": "essay", "prompt": "Q"}],
        )
    )
    assert result["error"] is True
    assert result["detail"].startswith("mode must be one of: append, overwrite")


def test_qjudge_exam_rejects_coding_contest(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail(contest_type="coding")
        raise AssertionError("Should stop before exam-question endpoint call")

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_exam("create", "11111111-1111-1111-1111-111111111111", DummyContext(), question_type="essay", prompt="Q"))

    assert result == {
        "error": True,
        "detail": "qjudge_exam only supports paper_exam contests. This contest is coding. Use qjudge_coding_problems instead.",
        "status": 400,
    }


# ---------- qjudge_coding_problems tests (contest-scoped) ----------


def test_qjudge_contest_manager_get_detail(monkeypatch):
    captured = {}
    contest_uuid = "33333333-3333-3333-3333-333333333333"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return {"id": contest_uuid, "name": "T"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_contest_manager("get_detail", DummyContext(), contest_id=contest_uuid))

    assert result == {"id": contest_uuid, "name": "T"}
    assert captured == {"method": "GET", "path": f"/api/v1/contests/{contest_uuid}/"}


def test_qjudge_contest_manager_update_patches_only_given_settings(monkeypatch):
    captured = {}
    contest_uuid = "33333333-3333-3333-3333-333333333333"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured.update(method=method, path=path, json_body=json_body)
        return {"id": contest_uuid}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_contest_manager(
            "update",
            DummyContext(),
            contest_id=contest_uuid,
            name="New",
            allow_multiple_joins=False,
        )
    )

    assert captured == {
        "method": "PATCH",
        "path": f"/api/v1/contests/{contest_uuid}/",
        "json_body": {"name": "New", "allow_multiple_joins": False},
    }


def test_qjudge_contest_manager_update_sends_webcam_required_and_clear_fields(monkeypatch):
    captured = {}
    contest_uuid = "33333333-3333-3333-3333-333333333333"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["json_body"] = json_body
        return {"id": contest_uuid}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_contest_manager(
            "update",
            DummyContext(),
            contest_id=contest_uuid,
            webcam_required=False,
            clear_fields=["end_time"],
        )
    )

    assert captured["json_body"] == {"webcam_required": False, "end_time": None}


def test_qjudge_contest_manager_update_rejects_setting_and_clearing_the_same_field():
    result = run(
        server.qjudge_contest_manager(
            "update",
            DummyContext(),
            contest_id="33333333-3333-3333-3333-333333333333",
            end_time="2026-10-01T00:00:00Z",
            clear_fields=["end_time"],
        )
    )

    assert result["error"] is True
    assert "end_time" in result["detail"]


def test_update_schema_replaces_the_device_policy_with_webcam_required():
    tools = {tool.name: tool for tool in run(server.mcp.list_tools())}
    properties = tools["qjudge_contest_manager"].inputSchema["properties"]

    assert "anticheat_device_policy" not in properties
    assert any(option.get("type") == "boolean" for option in properties["webcam_required"]["anyOf"])


def test_qjudge_contest_manager_update_requires_a_field():
    result = run(
        server.qjudge_contest_manager(
            "update", DummyContext(), contest_id="33333333-3333-3333-3333-333333333333"
        )
    )

    assert result["error"] is True


def test_qjudge_contest_manager_list_problems_coding(monkeypatch):
    captured = {}
    contest_uuid = "44444444-4444-4444-4444-444444444444"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == f"/api/v1/contests/{contest_uuid}/":
            return contest_detail(contest_id=contest_uuid, contest_type="coding")
        captured["method"] = method
        captured["path"] = path
        return [{"id": "b-1", "title": "A+B"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_contest_manager("list_problems", DummyContext(), contest_id=contest_uuid))

    assert result == {"count": 1, "items": [{"id": "b-1", "title": "A+B"}]}
    assert captured == {"method": "GET", "path": f"/api/v1/contests/{contest_uuid}/problems/"}


def test_qjudge_contest_manager_list_problems_paper_exam(monkeypatch):
    captured = {}
    contest_uuid = "55555555-5555-5555-5555-555555555555"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == f"/api/v1/contests/{contest_uuid}/":
            return contest_detail(contest_id=contest_uuid, contest_type="paper_exam")
        captured["method"] = method
        captured["path"] = path
        return [{"id": "eq-1"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_contest_manager("list_problems", DummyContext(), contest_id=contest_uuid))

    assert result == {"count": 1, "items": [{"id": "eq-1"}]}
    assert captured == {"method": "GET", "path": f"/api/v1/contests/{contest_uuid}/exam-questions/"}


def test_qjudge_contest_manager_requires_contest_id():
    result = run(server.qjudge_contest_manager("list_problems", DummyContext()))
    assert result["error"] is True
    assert result["detail"].startswith("contest_id is required")


def test_qjudge_contest_manager_requires_uuid():
    result = run(server.qjudge_contest_manager("get_detail", DummyContext(), contest_id="1"))
    assert result["error"] is True
    assert result["status"] == 400
    assert 'contest_id must be a UUID string, got "1".' in result["detail"]


def test_qjudge_coding_problems_get(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/22222222-2222-2222-2222-222222222222/":
            return contest_detail(contest_id="22222222-2222-2222-2222-222222222222", contest_type="coding")
        captured["method"] = method
        captured["path"] = path
        return {"id": "44444444-4444-4444-4444-444444444444", "title": "A+B"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding_problems("get", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", binding_id="44444444-4444-4444-4444-444444444444"))

    assert result == {"id": "44444444-4444-4444-4444-444444444444", "title": "A+B"}
    assert captured == {"method": "GET", "path": "/api/v1/contests/22222222-2222-2222-2222-222222222222/problems/44444444-4444-4444-4444-444444444444/"}


def test_qjudge_coding_problems_get_requires_ids():
    assert run(server.qjudge_coding_problems("get", DummyContext()))["detail"].startswith("contest_id is required")
    assert run(
        server.qjudge_coding_problems("get", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222")
    )["detail"].startswith("binding_id is required")


def test_qjudge_coding_problems_create(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/22222222-2222-2222-2222-222222222222/":
            return contest_detail(contest_id="22222222-2222-2222-2222-222222222222", contest_type="coding")
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "p-new"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding_problems("create", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", title="New Problem"))

    assert result["id"] == "p-new"
    assert "warnings" in result
    assert captured == {
        "method": "POST",
        "path": "/api/v1/contests/22222222-2222-2222-2222-222222222222/problems/",
        "json_body": {"title": "New Problem"},
    }


def test_qjudge_coding_problems_create_full(monkeypatch):
    """Create with all fields — no warnings."""
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/22222222-2222-2222-2222-222222222222/":
            return contest_detail(contest_id="22222222-2222-2222-2222-222222222222", contest_type="coding")
        captured["json_body"] = json_body
        return {"id": "p-new"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding_problems(
            "create", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", title="Full Problem",
            description="desc",
            input_description="in",
            output_description="out",
            test_cases=[{"input_data": "1", "output_data": "1", "weight_percent": 100}],
            language_configs=[{"language": "python", "template_code": "", "is_enabled": True, "order": 0}],
        )
    )

    assert result == {"id": "p-new"}
    assert "warnings" not in result
    assert captured["json_body"]["description"] == "desc"
    assert captured["json_body"]["language_configs"] == [
        {"language": "python", "template_code": "", "is_enabled": True, "order": 0}
    ]


def test_qjudge_coding_problems_update(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/22222222-2222-2222-2222-222222222222/":
            return contest_detail(contest_id="22222222-2222-2222-2222-222222222222", contest_type="coding")
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "44444444-4444-4444-4444-444444444444", "title": "Updated"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding_problems(
            "update", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", binding_id="44444444-4444-4444-4444-444444444444",
            description="new desc",
        )
    )

    assert result["id"] == "44444444-4444-4444-4444-444444444444"
    assert captured == {
        "method": "PATCH",
        "path": "/api/v1/contests/22222222-2222-2222-2222-222222222222/problems/44444444-4444-4444-4444-444444444444/",
        "json_body": {"description": "new desc"},
    }


def test_qjudge_coding_problems_update_requires_binding_id():
    result = run(server.qjudge_coding_problems("update", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222"))
    assert result["detail"].startswith("binding_id is required")


def test_qjudge_coding_problems_create_requires_fields():
    assert run(server.qjudge_coding_problems("create", DummyContext()))["detail"].startswith("contest_id is required")
    assert run(
        server.qjudge_coding_problems("create", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222")
    )["detail"].startswith("title is required")


def test_qjudge_coding_problems_delete(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/22222222-2222-2222-2222-222222222222/":
            return contest_detail(contest_id="22222222-2222-2222-2222-222222222222", contest_type="coding")
        captured["method"] = method
        captured["path"] = path
        return {"status": "success"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding_problems("delete", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", binding_id="44444444-4444-4444-4444-444444444444"))

    assert result == {"status": "success"}
    assert captured == {"method": "DELETE", "path": "/api/v1/contests/22222222-2222-2222-2222-222222222222/problems/44444444-4444-4444-4444-444444444444/"}


def test_qjudge_coding_problems_delete_requires_ids():
    assert run(server.qjudge_coding_problems("delete", DummyContext()))["detail"].startswith("contest_id is required")
    assert run(
        server.qjudge_coding_problems("delete", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222")
    )["detail"].startswith("binding_id is required")


def test_tool_schemas_enumerate_supported_actions():
    tools = {tool.name: tool for tool in run(server.mcp.list_tools())}
    expected = {
        "qjudge_browse": {"list_classrooms", "get_classroom", "list_classroom_contests", "list_contests", "get_contest", "get_help"},
        "qjudge_contest_manager": {"create", "get_detail", "list_problems", "reorder", "update"},
        "qjudge_exam": {"get", "create", "update", "delete", "import_from_bank", "batch_create"},
        "qjudge_grading": {"list_answers", "question_detail", "dashboard", "grade", "batch_grade", "ungrade"},
        "qjudge_coding_problems": {"get", "create", "update", "delete"},
    }
    for name, actions in expected.items():
        assert set(tools[name].inputSchema["properties"]["action"]["enum"]) == actions


def test_browse_list_contests_follows_pagination(monkeypatch):
    paths = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        paths.append(path)
        if path == "/api/v1/contests/?scope=manage":
            return {"results": [{"id": "11111111-1111-1111-1111-111111111111"}], "next": "http://backend/?page=2"}
        if path == "/api/v1/contests/?scope=manage&page=2":
            return {"results": [{"id": "22222222-2222-2222-2222-222222222222"}], "next": None}
        return {"id": path.split("/")[-2], "name": "C", "contest_type": "coding"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_browse("list_contests", DummyContext()))

    assert result["count"] == 2
    assert [row["contest_id"] for row in result["items"]] == [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
    ]


def test_exam_ids_are_encoded_as_single_path_segments(monkeypatch):
    paths = []

    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        paths.append(path)
        return {}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(server.qjudge_exam("get", "11111111-1111-1111-1111-111111111111", DummyContext(), question_id="../x"))

    assert paths == ["/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/..%2Fx/"]


# ---------------------------------------------------------------------------
# qjudge_code_runner tests
# ---------------------------------------------------------------------------

def test_qjudge_code_runner(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None, timeout=30.0):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        captured["timeout"] = timeout
        return {"results": [{"status": "AC"}]}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_code_runner(
            problem_id="44444444-4444-4444-4444-444444444444",
            language="python",
            code="print(1+2)",
            ctx=DummyContext(),
        )
    )

    assert result == {"results": [{"status": "AC"}]}
    assert captured == {
        "method": "POST",
        "path": "/api/v1/management/problems/44444444-4444-4444-4444-444444444444/test_run/",
        "json_body": {"language": "python", "code": "print(1+2)"},
        "timeout": 120.0,
    }


def test_qjudge_code_runner_requires_fields():
    assert run(server.qjudge_code_runner(problem_id="", language="py", code="x", ctx=DummyContext()))["detail"].startswith("problem_id is required")
    assert run(server.qjudge_code_runner(problem_id="44444444-4444-4444-4444-444444444444", language="", code="x", ctx=DummyContext()))["detail"].startswith("language is required")
    assert run(server.qjudge_code_runner(problem_id="44444444-4444-4444-4444-444444444444", language="py", code="", ctx=DummyContext()))["detail"].startswith("code is required")
    assert run(server.qjudge_code_runner(problem_id="44444444-4444-4444-4444-444444444444", language="py", code="   ", ctx=DummyContext()))["detail"].startswith("code is required")


def test_qjudge_code_runner_normalizes_language_aliases(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None, timeout=30.0):
        captured["json_body"] = json_body
        return {"ok": True}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(server.qjudge_code_runner(problem_id="44444444-4444-4444-4444-444444444444", language="c++", code="int main(){}", ctx=DummyContext()))
    assert captured["json_body"]["language"] == "cpp"

    run(server.qjudge_code_runner(problem_id="44444444-4444-4444-4444-444444444444", language="python3", code="print(1)", ctx=DummyContext()))
    assert captured["json_body"]["language"] == "python"


def test_qjudge_code_runner_rejects_unsupported_language():
    result = run(server.qjudge_code_runner(problem_id="44444444-4444-4444-4444-444444444444", language="javascript", code="console.log(1)", ctx=DummyContext()))
    assert result["error"] is True
    assert result["status"] == 400
    assert "Unsupported language for qjudge_code_runner" in result["detail"]


def test_qjudge_coding_problems_rejects_paper_exam_contest(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        if path == "/api/v1/contests/22222222-2222-2222-2222-222222222222/":
            return contest_detail(contest_id="22222222-2222-2222-2222-222222222222", contest_type="paper_exam")
        raise AssertionError("Should stop before coding endpoint call")

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding_problems("create", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", title="A+B"))

    assert result == {
        "error": True,
        "detail": "qjudge_coding_problems only supports coding contests. This contest is paper_exam. Use qjudge_exam instead.",
        "status": 400,
    }


# ---------------------------------------------------------------------------
# Newline normalisation helpers
# ---------------------------------------------------------------------------

def test_normalize_newlines_converts_literal_backslash_n():
    assert server._normalize_newlines("line1\\nline2\\n") == "line1\nline2\n"


def test_normalize_newlines_preserves_real_newlines():
    assert server._normalize_newlines("line1\nline2\n") == "line1\nline2\n"


def test_normalize_newlines_keeps_escapes_in_multiline_text():
    text = 'printf("\\n");\nreturn 0;'
    assert server._normalize_newlines(text) == text


def test_normalize_body_text_covers_test_cases_and_coding_text():
    body = {
        "prompt": "hello\\nworld",
        "description": "a\\nb",
        "hint": "h\\ni",
        "test_cases": [{"input_data": "1\\n", "output_data": "2\\n"}],
    }
    server._normalize_body_text(body)
    assert body["prompt"] == "hello\nworld"
    assert body["description"] == "a\nb"
    assert body["hint"] == "h\ni"
    assert body["test_cases"][0] == {"input_data": "1\n", "output_data": "2\n"}


def test_build_exam_question_body_normalizes_prompt():
    body = server._build_exam_question_body(prompt="line1\\nline2", question_type="single_choice")
    assert body["prompt"] == "line1\nline2"


def test_auth_settings_configured():
    """Verify MCP server has auth settings for OAuth discovery."""
    assert isinstance(server.mcp._token_verifier, server.QJudgeTokenVerifier)


def test_qjudge_verifier_fetches_jwks_with_the_backend_transport_headers(monkeypatch):
    created = {}

    class RecordingJwksClient:
        def __init__(self, url, *, headers=None):
            created["url"] = url
            created["headers"] = headers

    monkeypatch.setattr(server, "PyJWKClient", RecordingJwksClient)

    server.QJudgeTokenVerifier()

    assert created == {
        "url": server.OAUTH_JWKS_URL,
        "headers": {"X-Forwarded-Proto": server.DJANGO_FORWARDED_PROTO},
    }


def test_qjudge_verifier_accepts_local_mcp_jwt_without_remote_call():
    private_key = Ed25519PrivateKey.generate()
    token = jwt.encode(
        {
            "iss": "https://issuer.test",
            "sub": "teacher-42",
            "aud": "qjudge-mcp",
            "scope": "mcp",
            "iat": 1_700_000_000,
            "nbf": 1_700_000_000,
            "exp": 1_900_000_000,
        },
        private_key,
        algorithm="EdDSA",
        headers={"kid": "qjudge-ai-ed25519-v1"},
    )

    verifier = server.QJudgeTokenVerifier(
        issuer="https://issuer.test",
        jwks_client=StaticJwksClient(private_key.public_key()),
        opaque_fallback=FailingFallback(),
    )
    access_token = run(verifier.verify_token(token))

    assert access_token is not None
    assert access_token.token == token
    assert access_token.client_id == "teacher-42"
    assert access_token.scopes == ["mcp"]


def test_qjudge_verifier_rejects_wrong_local_jwt_without_opaque_fallback():
    private_key = Ed25519PrivateKey.generate()
    token = jwt.encode(
        {
            "iss": "https://issuer.test",
            "sub": "teacher-42",
            "aud": "ai-service",
            "scope": "ai:chat",
            "iat": 1_700_000_000,
            "nbf": 1_700_000_000,
            "exp": 1_900_000_000,
        },
        private_key,
        algorithm="EdDSA",
        headers={"kid": "qjudge-ai-ed25519-v1"},
    )
    fallback = RecordingFallback()
    verifier = server.QJudgeTokenVerifier(
        issuer="https://issuer.test",
        jwks_client=StaticJwksClient(private_key.public_key()),
        opaque_fallback=fallback,
    )

    assert run(verifier.verify_token(token)) is None
    assert fallback.tokens == []


def test_qjudge_verifier_preserves_opaque_fallback():
    fallback = RecordingFallback(
        server.AccessToken(token="opaque", client_id="qjudge", scopes=["mcp"])
    )
    verifier = server.QJudgeTokenVerifier(
        issuer="https://issuer.test",
        jwks_client=StaticJwksClient(None),
        opaque_fallback=fallback,
    )

    access_token = run(verifier.verify_token("opaque"))

    assert access_token is not None
    assert fallback.tokens == ["opaque"]


# ============================================================
# Auth chain edge cases
# ============================================================


def test_verify_token_returns_none_on_non_200(monkeypatch):
    calls = []
    response = FakeResponse(403)
    monkeypatch.setattr(
        server.httpx, "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )
    token = run(server.DjangoTokenVerifier().verify_token("bad-token"))
    assert token is None


def test_verify_token_returns_none_on_request_error(monkeypatch):
    class FailingClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            return None
        async def get(self, url, **kwargs):
            raise server.httpx.RequestError("connection refused")

    monkeypatch.setattr(
        server.httpx, "AsyncClient",
        lambda timeout: FailingClient(),
    )
    token = run(server.DjangoTokenVerifier().verify_token("some-token"))
    assert token is None


def test_verify_token_returns_none_on_timeout(monkeypatch):
    class TimeoutClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            return None
        async def get(self, url, **kwargs):
            raise server.httpx.TimeoutException("timed out")

    monkeypatch.setattr(
        server.httpx, "AsyncClient",
        lambda timeout: TimeoutClient(),
    )
    token = run(server.DjangoTokenVerifier().verify_token("some-token"))
    assert token is None


def test_django_api_omits_auth_when_no_authorization_header(monkeypatch):
    calls = []
    response = FakeResponse(200, payload={"ok": True})
    monkeypatch.setattr(
        server.httpx, "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )

    ctx = DummyContext(headers={})  # no authorization header
    run(server.django_api("GET", "/api/v1/test/", ctx))

    assert len(calls) == 1
    sent_headers = calls[0]["headers"]
    assert "Authorization" not in sent_headers
    assert "X-Forwarded-Proto" in sent_headers


def test_django_api_omits_auth_when_request_is_none(monkeypatch):
    """When ctx.request_context.request is None, django_api should not crash."""
    calls = []
    response = FakeResponse(200, payload={"ok": True})
    monkeypatch.setattr(
        server.httpx, "AsyncClient",
        lambda timeout: FakeAsyncClient(response, calls, timeout=timeout),
    )

    ctx = DummyContext()
    ctx.request_context.request = None  # simulate missing transport request
    result = run(server.django_api("GET", "/api/v1/test/", ctx))

    assert result == {"ok": True}
    assert "Authorization" not in calls[0]["headers"]


def test_protected_resource_metadata_advertises_only_mcp_scope():
    from starlette.testclient import TestClient

    app = server.mcp.streamable_http_app()
    metadata_path = next(
        route.path
        for route in app.routes
        if route.path.startswith("/.well-known/oauth-protected-resource")
    )
    response = TestClient(app).get(metadata_path)

    assert response.status_code == 200
    assert response.json()["scopes_supported"] == ["mcp"]
