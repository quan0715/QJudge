import asyncio
import json
import sys
from pathlib import Path

import httpx
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

    async def get(self, url, **kwargs):
        self._recorder.append({"url": url, **kwargs})
        return self._response


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


def test_artifact_csv_delete_rows_by_row_index(tmp_path):
    csv_path = tmp_path / "answers.csv"
    csv_path.write_text(
        "index,exam_answer_id,score,reason\n"
        "1,2088,,\n"
        "2,2088,2,重複資料，答案完整正確\n"
        "3,3001,1,ok\n",
        encoding="utf-8",
    )

    result = server.artifact_csv_delete_rows(
        file_path=str(csv_path),
        row_index=1,
    )

    assert result["status"] == "success"
    assert result["deleted_count"] == 1
    assert result["after_count"] == 2
    assert csv_path.read_text(encoding="utf-8") == (
        "index,exam_answer_id,score,reason\n"
        "2,2088,2,重複資料，答案完整正確\n"
        "3,3001,1,ok\n"
    )


def test_artifact_csv_delete_rows_by_match(tmp_path):
    csv_path = tmp_path / "answers.csv"
    csv_path.write_text(
        "index,exam_answer_id,score,reason\n"
        "1,2088,,\n"
        "2,2088,2,重複資料，答案完整正確\n"
        "3,2088,,\n",
        encoding="utf-8",
    )

    result = server.artifact_csv_delete_rows(
        file_path=str(csv_path),
        match={"exam_answer_id": "2088", "score": ""},
        delete_all_matches=True,
    )

    assert result["status"] == "success"
    assert result["deleted_count"] == 2
    assert result["after_count"] == 1
    assert csv_path.read_text(encoding="utf-8") == (
        "index,exam_answer_id,score,reason\n"
        "2,2088,2,重複資料，答案完整正確\n"
    )


def test_artifact_csv_delete_rows_requires_selector(tmp_path):
    csv_path = tmp_path / "answers.csv"
    csv_path.write_text("index,exam_answer_id,score\n1,2088,\n", encoding="utf-8")

    result = server.artifact_csv_delete_rows(file_path=str(csv_path))

    assert result["error"] is True
    assert result["status"] == 400
    assert "selector" in result["detail"]


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


def test_verify_token_uses_canonical_auth_me_path(monkeypatch):
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
        "url": f"{server.DJANGO_BASE_URL}/api/v1/auth/me",
        "headers": {
            "Authorization": "Bearer token-123",
            "X-Forwarded-Proto": server.DJANGO_FORWARDED_PROTO,
        },
    }]


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
    unknown = run(server.qjudge_exam("wat", "11111111-1111-1111-1111-111111111111", DummyContext()))

    assert missing_question["error"] is True
    assert missing_question["detail"].startswith("question_id is required")
    assert no_update_fields["error"] is True
    assert no_update_fields["detail"].startswith("No fields to update")
    assert unknown["error"] is True
    assert "Unknown action: 'wat'" in unknown["detail"]
    assert "qjudge_exam supports" in unknown["detail"]


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

    result = run(server.qjudge_grading("question_detail", "11111111-1111-1111-1111-111111111111", DummyContext(), question_id="q-1"))

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


def test_qjudge_browse_rejects_contest_operations():
    result = run(server.qjudge_browse("list_problems", DummyContext()))
    assert result["error"] is True
    assert result["status"] == 400
    assert "Action 'list_problems' is not available on qjudge_browse" in result["detail"]


# qjudge_bank tests removed while the MCP tool is disabled (implementation kept as comments in server.py).


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


def test_build_exam_question_diff_applies_patch_and_marks_changed_fields():
    current = {
        "id": "eq-1",
        "question_type": "single_choice",
        "prompt": "Old prompt",
        "explanation": "Old explanation",
        "score": 5,
        "options": ["A", "B"],
        "correct_answer": 0,
    }
    patch = {
        "prompt": "New prompt",
        "score": 8,
        "options": ["A", "B"],
    }

    diff = server._build_exam_question_diff(current, patch)

    assert diff["question_id"] == "eq-1"
    assert diff["has_changes"] is True
    assert diff["proposed_question"]["prompt"] == "New prompt"
    assert diff["proposed_question"]["score"] == 8
    assert diff["proposed_question"]["explanation"] == "Old explanation"
    assert [change["field"] for change in diff["changes"]] == ["prompt", "score"]
    assert diff["summary"] == {"changed": 2, "unchanged": 4}


def test_preview_exam_question_update_fetches_current_and_returns_diff_widget(monkeypatch):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None, timeout=30.0):
        calls.append((method, path, json_body))
        if path == "/api/v1/contests/11111111-1111-1111-1111-111111111111/":
            return contest_detail()
        return {
            "id": "eq-1",
            "question_type": "essay",
            "prompt": "Explain CAP.",
            "explanation": "Old explanation",
            "score": 10,
            "options": None,
            "correct_answer": None,
        }

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.preview_exam_question_update(
            "11111111-1111-1111-1111-111111111111",
            "eq-1",
            DummyContext(),
            prompt="Explain CAP theorem with an example.",
            score=12,
        )
    )

    assert result.structuredContent["kind"] == "exam_question_diff"
    assert result.structuredContent["question_id"] == "eq-1"
    assert result.structuredContent["summary"] == {"changed": 2, "unchanged": 4}
    assert result.meta["ui"]["resourceUri"] == server.EXAM_QUESTION_DIFF_TEMPLATE_URI
    assert result.meta["openai/outputTemplate"] == server.EXAM_QUESTION_DIFF_TEMPLATE_URI
    assert calls == [
        ("GET", "/api/v1/contests/11111111-1111-1111-1111-111111111111/", None),
        ("GET", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/eq-1/", None),
    ]


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
        ("DELETE", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/old-1/", None),
        ("DELETE", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/old-2/", None),
        ("POST", "/api/v1/contests/11111111-1111-1111-1111-111111111111/exam-questions/", {"question_type": "essay", "prompt": "Fresh question", "score": 10}),
    ]


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

    result = run(server.qjudge_coding_problems("get", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", problem_id="44444444-4444-4444-4444-444444444444"))

    assert result == {"id": "44444444-4444-4444-4444-444444444444", "title": "A+B"}
    assert captured == {"method": "GET", "path": "/api/v1/contests/22222222-2222-2222-2222-222222222222/problems/44444444-4444-4444-4444-444444444444/"}


def test_qjudge_coding_problems_get_requires_ids():
    assert run(server.qjudge_coding_problems("get", DummyContext()))["detail"].startswith("contest_id is required")
    assert run(
        server.qjudge_coding_problems("get", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222")
    )["detail"].startswith("problem_id is required")


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
            "update", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", problem_id="44444444-4444-4444-4444-444444444444",
            description="new desc",
        )
    )

    assert result["id"] == "44444444-4444-4444-4444-444444444444"
    assert captured == {
        "method": "PATCH",
        "path": "/api/v1/contests/22222222-2222-2222-2222-222222222222/problems/44444444-4444-4444-4444-444444444444/",
        "json_body": {"description": "new desc"},
    }


def test_qjudge_coding_problems_update_requires_problem_id():
    result = run(server.qjudge_coding_problems("update", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222"))
    assert result["detail"].startswith("problem_id is required")


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

    result = run(server.qjudge_coding_problems("delete", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222", problem_id="44444444-4444-4444-4444-444444444444"))

    assert result == {"status": "success"}
    assert captured == {"method": "DELETE", "path": "/api/v1/contests/22222222-2222-2222-2222-222222222222/problems/44444444-4444-4444-4444-444444444444/"}


def test_qjudge_coding_problems_delete_requires_ids():
    assert run(server.qjudge_coding_problems("delete", DummyContext()))["detail"].startswith("contest_id is required")
    assert run(
        server.qjudge_coding_problems("delete", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222")
    )["detail"].startswith("problem_id is required")


def test_qjudge_coding_problems_unknown_action():
    result = run(server.qjudge_coding_problems("wat", DummyContext(), contest_id="22222222-2222-2222-2222-222222222222"))
    assert result["error"] is True
    assert "Unknown action: 'wat'" in result["detail"]
    assert "qjudge_coding_problems supports" in result["detail"]
    assert "qjudge_code_runner" in result["detail"]


def test_qjudge_coding_problems_retired_actions_not_exposed():
    """Backend may still have routes; MCP no longer exposes import_from_bank / update_score."""
    for action in ("import_from_bank", "update_score"):
        r = run(server.qjudge_coding_problems(action, DummyContext(), contest_id="22222222-2222-2222-2222-222222222222"))
        assert r.get("error") is True
        assert f"Unknown action: '{action}'" in r.get("detail", "")


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


def test_normalize_test_cases():
    cases = [{"input_data": "1 2\\n3 4\\n", "output_data": "5\\n"}]
    result = server._normalize_test_cases(cases)
    assert result[0]["input_data"] == "1 2\n3 4\n"
    assert result[0]["output_data"] == "5\n"


def test_normalize_translations():
    trs = [{"description": "desc\\nline2", "input_description": "in\\nformat", "title": "t"}]
    result = server._normalize_translations(trs)
    assert result[0]["description"] == "desc\nline2"
    assert result[0]["input_description"] == "in\nformat"
    assert result[0]["title"] == "t"


def test_normalize_body_text_handles_coding_ext():
    body = {
        "prompt": "hello\\nworld",
        "coding_ext": {
            "translations": [{"description": "a\\nb"}],
            "test_cases": [{"input_data": "1\\n", "output_data": "2\\n"}],
        },
    }
    server._normalize_body_text(body)
    assert body["prompt"] == "hello\nworld"
    assert body["coding_ext"]["translations"][0]["description"] == "a\nb"
    assert body["coding_ext"]["test_cases"][0]["input_data"] == "1\n"


def test_build_exam_question_body_normalizes_prompt():
    body = server._build_exam_question_body(prompt="line1\\nline2", question_type="single_choice")
    assert body["prompt"] == "line1\nline2"


def test_auth_settings_configured():
    """Verify MCP server has auth settings for OAuth discovery."""
    assert isinstance(server.mcp._token_verifier, server.DjangoTokenVerifier)


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
