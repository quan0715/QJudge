import asyncio
import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def run(coro):
    return asyncio.run(coro)


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
        "headers": {"X-Forwarded-Proto": "https", "Authorization": "Bearer token"},
        "json": {"hello": "world"},
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
        "status": 400,
        "detail": {"message": "bad request"},
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
        "status": 502,
        "detail": {"raw": "upstream failed"},
    }


def test_strip_snapshots_handles_list_and_string_inputs():
    raw_list = [{
        "id": "1",
        "question_snapshot": {"prompt": "Q1"},
        "correct_answer_snapshot": {"selected": "A"},
        "answer": {"selected": "B"},
    }]
    list_result = server._strip_snapshots(raw_list)
    assert list_result == [{"id": "1", "answer": {"selected": "B"}}]

    raw_string = json.dumps({
        "responses": [{
            "exam_answer_id": "1",
            "question_snapshot": {"prompt": "Q1"},
            "correct_answer_snapshot": {"selected": "A"},
            "answer": {"selected": "B"},
        }]
    })
    string_result = server._strip_snapshots(raw_string)
    assert json.loads(string_result) == {
        "responses": [{
            "exam_answer_id": "1",
            "answer": {"selected": "B"},
        }]
    }


def test_strip_snapshots_leaves_non_json_string_unchanged():
    raw = "not-json"
    assert server._strip_snapshots(raw) == raw


def test_qjudge_discover_builds_encoded_query(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"items": []}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_discover(
            "list_classrooms",
            DummyContext(),
            search="algo & ds",
        )
    )

    assert result == {"items": []}
    assert captured == {
        "method": "GET",
        "path": "/api/v1/classrooms/?scope=manage&search=algo+%26+ds",
        "json_body": None,
    }


def test_qjudge_exam_reorder_generates_orders(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"status": "success"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_exam(
            "reorder",
            "contest-1",
            DummyContext(),
            question_ids=["q3", "q1", "q2"],
        )
    )

    assert result == {"status": "success"}
    assert captured == {
        "method": "POST",
        "path": "/api/v1/contests/contest-1/exam-questions/reorder/",
        "json_body": {
            "orders": [
                {"id": "q3", "order": 0},
                {"id": "q1", "order": 1},
                {"id": "q2", "order": 2},
            ]
        },
    }


def test_qjudge_exam_returns_fixed_errors():
    missing_question = run(server.qjudge_exam("get", "contest-1", DummyContext()))
    no_update_fields = run(
        server.qjudge_exam(
            "update",
            "contest-1",
            DummyContext(),
            question_id="q1",
        )
    )
    unknown = run(server.qjudge_exam("wat", "contest-1", DummyContext()))

    assert missing_question == {"error": True, "detail": "question_id is required"}
    assert no_update_fields == {"error": True, "detail": "No fields to update"}
    assert unknown == {"error": True, "detail": "Unknown action: wat"}


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
            "question_snapshot": {"prompt": "snapshot"},
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
            "contest-1",
            DummyContext(),
            question_id="q-1",
        )
    )

    assert result == [{
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
    }]


def test_qjudge_grading_question_detail_strips_participants_and_omitted_by_default(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None):
        return {
            "question_id": "q-1",
            "responses": [{
                "exam_answer_id": "ans-1",
                "answer": {"text": "hello"},
                "question_snapshot": {"prompt": "snapshot"},
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

    result = run(server.qjudge_grading("question_detail", "contest-1", DummyContext(), question_id="q-1"))

    assert result == {
        "question_id": "q-1",
        "responses": [{
            "exam_answer_id": "ans-1",
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

    result = run(server.qjudge_grading("dashboard", "contest-1", DummyContext()))

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
            "contest-1",
            DummyContext(),
            exam_answer_id="ans-1",
            score=8,
        )
    )
    batch_result = run(
        server.qjudge_grading(
            "batch_grade",
            "contest-1",
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
        "status": "success",
        "graded_count": 1,
        "error_count": 1,
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
            "contest-1",
            DummyContext(),
            question_id=kwargs.get("question_id"),
            exam_answer_id=kwargs.get("exam_answer_id"),
            score=kwargs.get("score"),
            grades=kwargs.get("grades"),
        )
    )

    assert result == {"error": True, "detail": detail}


# ---------- qjudge_discover browse_banks tests ----------


def test_qjudge_discover_browse_banks(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return [{"uuid": "bank-1", "name": "My Bank"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_discover("browse_banks", DummyContext()))

    assert result == [{"uuid": "bank-1", "name": "My Bank"}]
    assert captured == {"method": "GET", "path": "/api/v1/question-banks/"}


def test_qjudge_discover_browse_bank_questions(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return [{"id": "q-1", "title": "A+B"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_discover("browse_bank_questions", DummyContext(), bank_id="bank-1"))

    assert result == [{"id": "q-1", "title": "A+B"}]
    assert captured == {"method": "GET", "path": "/api/v1/question-banks/bank-1/questions/"}


def test_qjudge_discover_browse_bank_questions_requires_bank_id():
    result = run(server.qjudge_discover("browse_bank_questions", DummyContext()))
    assert result == {"error": True, "detail": "bank_id is required"}


def test_qjudge_discover_create_bank_question(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "q-new"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    coding_ext = {
        "translations": [{"language": "zh-TW", "title": "A+B", "description": "求和"}],
        "test_cases": [{"input_data": "1 2", "output_data": "3", "is_sample": True, "weight_percent": 100}],
        "language_configs": [{"language": "python", "is_enabled": True}],
    }
    result = run(
        server.qjudge_discover(
            "create_bank_question", DummyContext(),
            bank_id="bank-1",
            question_type="coding",
            title="A+B Problem",
            difficulty="easy",
            score=100,
            coding_ext=coding_ext,
        )
    )

    assert result == {"id": "q-new"}
    assert captured["method"] == "POST"
    assert captured["path"] == "/api/v1/question-banks/bank-1/questions/"
    body = captured["json_body"]
    assert body["question_type"] == "coding"
    assert body["title"] == "A+B Problem"
    assert body["difficulty"] == "easy"
    assert body["score"] == 100
    assert body["coding_ext"] == coding_ext


def test_qjudge_discover_create_bank_question_requires_fields():
    assert run(server.qjudge_discover("create_bank_question", DummyContext()))["detail"] == "bank_id is required"
    assert run(server.qjudge_discover("create_bank_question", DummyContext(), bank_id="b"))["detail"] == "question_type is required"
    assert run(server.qjudge_discover("create_bank_question", DummyContext(), bank_id="b", question_type="coding"))["detail"] == "title is required"


# ---------- qjudge_exam import_from_bank tests ----------


def test_qjudge_exam_import_from_bank(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return [{"id": "eq-1"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    items = [
        {"question_bank_id": "bank-1", "question_id": "q-1"},
        {"question_bank_id": "bank-1", "question_id": "q-2"},
    ]
    result = run(server.qjudge_exam("import_from_bank", "contest-1", DummyContext(), items=items))

    assert result == [{"id": "eq-1"}]
    assert captured == {
        "method": "POST",
        "path": "/api/v1/contests/contest-1/exam-questions/import-from-bank/",
        "json_body": {"items": items},
    }


def test_qjudge_exam_import_from_bank_requires_items():
    result = run(server.qjudge_exam("import_from_bank", "contest-1", DummyContext()))
    assert result["error"] is True
    assert "items" in result["detail"]


# ---------- qjudge_coding tests (contest-scoped) ----------


def test_qjudge_coding_list(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return [{"id": "b-1", "title": "A+B"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding("list", DummyContext(), contest_id="c-1"))

    assert result == [{"id": "b-1", "title": "A+B"}]
    assert captured == {"method": "GET", "path": "/api/v1/contests/c-1/problems/"}


def test_qjudge_coding_list_requires_contest_id():
    result = run(server.qjudge_coding("list", DummyContext()))
    assert result == {"error": True, "detail": "contest_id is required"}


def test_qjudge_coding_get(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return {"id": "p-1", "title": "A+B"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding("get", DummyContext(), contest_id="c-1", problem_id="p-1"))

    assert result == {"id": "p-1", "title": "A+B"}
    assert captured == {"method": "GET", "path": "/api/v1/contests/c-1/problems/p-1/"}


def test_qjudge_coding_get_requires_ids():
    assert run(server.qjudge_coding("get", DummyContext()))["detail"] == "contest_id is required"
    assert run(server.qjudge_coding("get", DummyContext(), contest_id="c-1"))["detail"] == "problem_id is required"


def test_qjudge_coding_create(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "p-new"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding("create", DummyContext(), contest_id="c-1", title="New Problem"))

    assert result == {"id": "p-new"}
    assert captured == {
        "method": "POST",
        "path": "/api/v1/contests/c-1/problems/",
        "json_body": {"title": "New Problem"},
    }


def test_qjudge_coding_create_requires_fields():
    assert run(server.qjudge_coding("create", DummyContext()))["detail"] == "contest_id is required"
    assert run(server.qjudge_coding("create", DummyContext(), contest_id="c-1"))["detail"] == "title is required"


def test_qjudge_coding_import_from_bank(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return [{"id": "b-1"}]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    items = [
        {"question_bank_id": "bank-1", "question_id": "q-1"},
        {"question_bank_id": "bank-1", "question_id": "q-2"},
    ]
    result = run(server.qjudge_coding("import_from_bank", DummyContext(), contest_id="c-1", items=items))

    assert result == [{"id": "b-1"}]
    assert captured == {
        "method": "POST",
        "path": "/api/v1/contests/c-1/problems/import-from-bank/",
        "json_body": {"items": items},
    }


def test_qjudge_coding_import_from_bank_requires_fields():
    assert run(server.qjudge_coding("import_from_bank", DummyContext()))["detail"] == "contest_id is required"
    assert run(server.qjudge_coding("import_from_bank", DummyContext(), contest_id="c-1"))["detail"] == "items is required (list of {question_bank_id, question_id})"


def test_qjudge_coding_update_score(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "b-1", "max_score": 200}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding("update_score", DummyContext(), contest_id="c-1", problem_id="p-1", max_score=200)
    )

    assert result == {"id": "b-1", "max_score": 200}
    assert captured == {
        "method": "PATCH",
        "path": "/api/v1/contests/c-1/problems/p-1/score/",
        "json_body": {"max_score": 200},
    }


def test_qjudge_coding_update_score_requires_fields():
    assert run(server.qjudge_coding("update_score", DummyContext()))["detail"] == "contest_id is required"
    assert run(server.qjudge_coding("update_score", DummyContext(), contest_id="c-1"))["detail"] == "problem_id is required"
    assert run(server.qjudge_coding("update_score", DummyContext(), contest_id="c-1", problem_id="p-1"))["detail"] == "max_score is required"


def test_qjudge_coding_delete(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return {"status": "success"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding("delete", DummyContext(), contest_id="c-1", problem_id="p-1"))

    assert result == {"status": "success"}
    assert captured == {"method": "DELETE", "path": "/api/v1/contests/c-1/problems/p-1/"}


def test_qjudge_coding_delete_requires_ids():
    assert run(server.qjudge_coding("delete", DummyContext()))["detail"] == "contest_id is required"
    assert run(server.qjudge_coding("delete", DummyContext(), contest_id="c-1"))["detail"] == "problem_id is required"


def test_qjudge_coding_test_run(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"results": [{"status": "AC"}]}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding(
            "test_run", DummyContext(),
            problem_id="p-1",
            language="python",
            code="print(1+2)",
        )
    )

    assert result == {"results": [{"status": "AC"}]}
    assert captured == {
        "method": "POST",
        "path": "/api/v1/problems/p-1/test_run/",
        "json_body": {"language": "python", "code": "print(1+2)", "use_samples": True},
    }


def test_qjudge_coding_test_run_with_custom_cases(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["json_body"] = json_body
        return {"results": []}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    custom = [{"input": "5", "expected_output": "25"}]
    run(
        server.qjudge_coding(
            "test_run", DummyContext(),
            problem_id="p-1", language="cpp", code="#include",
            use_samples=False, custom_test_cases=custom,
        )
    )

    assert captured["json_body"]["use_samples"] is False
    assert captured["json_body"]["custom_test_cases"] == custom


def test_qjudge_coding_test_run_requires_fields():
    assert run(server.qjudge_coding("test_run", DummyContext(), language="py", code="x"))["detail"] == "problem_id is required"
    assert run(server.qjudge_coding("test_run", DummyContext(), problem_id="p-1", code="x"))["detail"] == "language is required"
    assert run(server.qjudge_coding("test_run", DummyContext(), problem_id="p-1", language="py"))["detail"] == "code is required"


def test_qjudge_coding_unknown_action():
    result = run(server.qjudge_coding("wat", DummyContext()))
    assert result == {"error": True, "detail": "Unknown action: wat"}


def test_auth_settings_configured():
    """Verify MCP server has auth settings for OAuth discovery."""
    assert isinstance(server.mcp._token_verifier, server.DjangoTokenVerifier)
