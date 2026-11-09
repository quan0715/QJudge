import asyncio
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


CONTEST = "11111111-1111-1111-1111-111111111111"


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


def paper(contest_type="paper_exam"):
    return {"id": CONTEST, "contest_type": contest_type}


def detail(**overrides):
    payload = {
        "id": 7,
        "exam_answer": 15,
        "question_id": "q-1",
        "question_order": 0,
        "question_label": "1(a)",
        "question_prompt": "P" * 300,
        "student_id": 3,
        "student_username": "stu",
        "status": "open",
        "created_at": "2026-11-01T00:00:00Z",
        "closed_at": None,
        "closed_by": None,
        "last_message_at": "2026-11-02T00:00:00Z",
        "current_score": 6,
        "current_max_score": 10,
        "messages": [
            {
                "id": 1,
                "author_id": 3,
                "author_username": "stu",
                "content": "請依原答案複核",
                "created_at": "2026-11-01T00:00:00Z",
            },
            {
                "id": 2,
                "author_id": 9,
                "author_username": "teacher",
                "content": "已看過原答案",
                "created_at": "2026-11-02T00:00:00Z",
            },
        ],
        "answer": {
            "answer": {"text": "原答案"},
            "feedback": "原評語",
            "question_type": "essay",
            "question_options": ["do-not-leak"],
        },
    }
    payload.update(overrides)
    return payload


def summary(**overrides):
    row = detail(**overrides)
    for key in ("messages", "answer", "current_score", "current_max_score"):
        row.pop(key, None)
    return row


def route(monkeypatch, responder):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None, timeout=30.0):
        calls.append({"method": method, "path": path, "json_body": json_body})
        if path == f"/api/v1/contests/{CONTEST}/":
            return paper()
        return responder(method, path, json_body)

    monkeypatch.setattr(server, "django_api", fake_django_api)
    return calls


def test_list_unwraps_envelope_and_filters_without_message_bodies(monkeypatch):
    calls = route(
        monkeypatch,
        lambda method, path, body: {
            "data": [
                summary(),
                summary(id=8, exam_answer=16, question_id="q-2", status="closed", student_username="other"),
            ],
            "meta": {"count": 2},
        },
    )

    result = run(
        server.qjudge_appeals(
            "list",
            CONTEST,
            DummyContext(),
            status="open",
            question_id="q-1",
            exam_answer_id=15,
        )
    )

    assert calls[1] == {"method": "GET", "path": f"/api/v1/contests/{CONTEST}/grade-appeals/", "json_body": None}
    assert result["count"] == 1
    item = result["items"][0]
    assert item["appeal_id"] == 7
    assert item["exam_answer_id"] == 15
    assert "messages" not in item
    assert item["question_prompt"] == ("P" * 119) + "…"
    assert len(item["question_prompt"]) == 120


def test_list_preserves_permission_error(monkeypatch):
    error = {
        "error": True,
        "errors": [{"code": "permission_denied", "message": "無法存取此考試的申訴。"}],
        "status": 403,
    }
    route(monkeypatch, lambda method, path, body: error)

    result = run(server.qjudge_appeals("list", CONTEST, DummyContext()))

    assert result == error


def test_list_rejects_malformed_success_and_accepts_empty(monkeypatch):
    route(monkeypatch, lambda method, path, body: {"data": {"id": 1}, "meta": {}})
    malformed = run(server.qjudge_appeals("list", CONTEST, DummyContext()))
    assert malformed["error"] is True
    assert malformed["status"] == 502

    route(monkeypatch, lambda method, path, body: {"data": [], "meta": {"count": 0}})
    empty = run(server.qjudge_appeals("list", CONTEST, DummyContext()))
    assert empty == {"count": 0, "items": []}


def test_get_returns_full_comments_and_hides_answer_by_default(monkeypatch):
    route(monkeypatch, lambda method, path, body: {"data": detail(), "meta": {}})

    result = run(server.qjudge_appeals("get", CONTEST, DummyContext(), appeal_id=7))

    assert result["appeal_id"] == 7
    assert [message["content"] for message in result["messages"]] == ["請依原答案複核", "已看過原答案"]
    assert result["current_score"] == 6
    assert "answer" not in result
    assert result["question_prompt"].endswith("…")
    assert len(result["question_prompt"]) == 240


def test_get_can_include_original_answer_and_full_prompt(monkeypatch):
    calls = route(monkeypatch, lambda method, path, body: {"data": detail(), "meta": {}})

    result = run(
        server.qjudge_appeals(
            "get",
            CONTEST,
            DummyContext(),
            appeal_id=7,
            include_answer=True,
            include_prompt=True,
        )
    )

    assert calls[1]["path"] == f"/api/v1/contests/{CONTEST}/grade-appeals/7/"
    assert result["question_prompt"] == "P" * 300
    assert result["answer"] == {"text": "原答案"}
    assert result["feedback"] == "原評語"
    assert result["question_type"] == "essay"
    assert "do-not-leak" not in str(result)


def test_send_posts_trimmed_comment_and_returns_only_the_new_message(monkeypatch):
    def responder(method, path, body):
        payload = detail()
        payload["messages"] = [
            *payload["messages"],
            {
                "id": 3,
                "author_id": 9,
                "author_username": "teacher",
                "content": body["content"],
                "created_at": "2026-11-03T00:00:00Z",
            },
        ]
        return {"data": payload, "meta": {}}

    calls = route(monkeypatch, responder)

    result = run(
        server.qjudge_appeals(
            "send",
            CONTEST,
            DummyContext(),
            appeal_id=7,
            content="  請再看第二段  ",
        )
    )

    assert calls[1] == {
        "method": "POST",
        "path": f"/api/v1/contests/{CONTEST}/grade-appeals/7/messages/",
        "json_body": {"content": "請再看第二段"},
    }
    assert result == {
        "status": "success",
        "appeal_id": 7,
        "appeal_status": "open",
        "message": {
            "id": 3,
            "author_id": 9,
            "author_username": "teacher",
            "content": "請再看第二段",
            "created_at": "2026-11-03T00:00:00Z",
        },
    }
    assert "messages" not in result


def test_send_passes_closed_appeal_error_through(monkeypatch):
    error = {
        "error": True,
        "errors": [{"code": "appeal_closed", "message": "申訴已結案，無法新增留言。"}],
        "status": 409,
        "meta": {},
    }
    route(monkeypatch, lambda method, path, body: error)

    result = run(server.qjudge_appeals("send", CONTEST, DummyContext(), appeal_id=7, content="晚了"))

    assert result == error


@pytest.mark.parametrize(
    ("kwargs", "detail"),
    [
        ({}, "appeal_id is required"),
        ({"appeal_id": 0, "content": "x"}, "appeal_id must be a positive integer."),
        ({"appeal_id": True, "content": "x"}, "appeal_id must be a positive integer."),
        ({"appeal_id": 7, "content": "   "}, "content is required"),
        ({"appeal_id": 7, "content": "x" * 5001}, "content must be at most 5000 characters."),
    ],
)
def test_send_rejects_invalid_input_before_http(monkeypatch, kwargs, detail):
    calls = route(monkeypatch, lambda method, path, body: {"data": detail(), "meta": {}})

    result = run(server.qjudge_appeals("send", CONTEST, DummyContext(), **kwargs))

    assert result["error"] is True
    assert result["detail"].startswith(detail)
    assert calls == []


def test_non_paper_contest_is_rejected_before_appeal_routes(monkeypatch):
    calls = []

    async def fake_django_api(method, path, ctx, *, json_body=None, timeout=30.0):
        calls.append(path)
        return paper("coding")

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_appeals("list", CONTEST, DummyContext()))

    assert result["status"] == 400
    assert "paper_exam" in result["detail"]
    assert calls == [f"/api/v1/contests/{CONTEST}/"]


def test_invalid_contest_id_does_not_call_django(monkeypatch):
    calls = route(monkeypatch, lambda method, path, body: {})

    result = run(server.qjudge_appeals("get", "not-a-uuid", DummyContext(), appeal_id=7))

    assert result["error"] is True
    assert result["detail"].startswith("contest_id must be a UUID")
    assert calls == []


def test_help_and_schema_expose_read_and_send_actions():
    help_result = run(server.qjudge_browse("get_help", DummyContext(), tool_name="qjudge_appeals"))
    assert help_result["tool"] == "qjudge_appeals"
    assert "send" in help_result["summary"]
    full_help = run(server.qjudge_browse("get_help", DummyContext()))
    assert "qjudge_appeals" in full_help["tools"]
    assert "appeal_id is not a UUID" in full_help["common_mistakes"]

    tools = {tool.name: tool for tool in run(server.mcp.list_tools())}
    tool = tools["qjudge_appeals"]
    assert set(tool.input_schema["properties"]["action"]["enum"]) == {"list", "get", "send"}
    assert set(tool.input_schema["required"]) == {"action", "contest_id"}
    annotations = tool.annotations
    assert annotations.read_only_hint is False
    assert annotations.destructive_hint is False
    assert annotations.idempotent_hint is False
    assert annotations.open_world_hint is True


@pytest.mark.parametrize(
    ("kwargs", "detail"),
    [
        ({"exam_answer_id": 0}, "exam_answer_id must be a positive integer."),
        ({"exam_answer_id": True}, "exam_answer_id must be a positive integer."),
        ({"exam_answer_id": -3}, "exam_answer_id must be a positive integer."),
        ({"question_id": "  "}, "question_id must be a non-empty string."),
        ({"status": "pending"}, 'status must be "open" or "closed".'),
    ],
)
def test_list_rejects_invalid_filters_before_http(monkeypatch, kwargs, detail):
    calls = route(monkeypatch, lambda method, path, body: {"data": [summary()], "meta": {}})

    result = run(server.qjudge_appeals("list", CONTEST, DummyContext(), **kwargs))

    assert result["error"] is True
    assert result["detail"].startswith(detail)
    assert calls == []


def test_list_strips_question_id_and_applies_each_filter(monkeypatch):
    rows = [
        summary(),
        summary(id=8, exam_answer=16, question_id="q-2", status="closed", student_username="other"),
    ]
    route(monkeypatch, lambda method, path, body: {"data": rows, "meta": {"count": 2}})

    by_question = run(server.qjudge_appeals("list", CONTEST, DummyContext(), question_id="  q-1  "))
    by_status = run(server.qjudge_appeals("list", CONTEST, DummyContext(), status="closed"))
    by_answer = run(server.qjudge_appeals("list", CONTEST, DummyContext(), exam_answer_id=16))
    missed = run(server.qjudge_appeals("list", CONTEST, DummyContext(), status="open", exam_answer_id=16))

    assert [item["appeal_id"] for item in by_question["items"]] == [7]
    assert [item["appeal_id"] for item in by_status["items"]] == [8]
    assert [item["appeal_id"] for item in by_answer["items"]] == [8]
    assert missed == {"count": 0, "items": []}


def test_list_accepts_a_bare_array_without_an_envelope(monkeypatch):
    route(monkeypatch, lambda method, path, body: [summary(question_prompt="")])

    result = run(server.qjudge_appeals("list", CONTEST, DummyContext()))

    assert result["count"] == 1
    assert result["items"][0]["question_prompt"] is None


@pytest.mark.parametrize(
    ("kwargs", "detail"),
    [
        ({}, "appeal_id is required"),
        ({"appeal_id": 0}, "appeal_id must be a positive integer."),
        ({"appeal_id": -1}, "appeal_id must be a positive integer."),
    ],
)
def test_get_rejects_invalid_appeal_id_before_http(monkeypatch, kwargs, detail):
    calls = route(monkeypatch, lambda method, path, body: {"data": detail(), "meta": {}})

    result = run(server.qjudge_appeals("get", CONTEST, DummyContext(), **kwargs))

    assert result["error"] is True
    assert result["detail"].startswith(detail)
    assert calls == []


def test_get_passes_not_found_and_rejects_malformed_messages(monkeypatch):
    missing = {
        "error": True,
        "errors": [{"code": "not_found", "message": "Not found."}],
        "status": 404,
    }
    route(monkeypatch, lambda method, path, body: missing)
    assert run(server.qjudge_appeals("get", CONTEST, DummyContext(), appeal_id=7)) == missing

    broken = detail()
    broken["messages"] = "not-a-list"
    route(monkeypatch, lambda method, path, body: {"data": broken, "meta": {}})
    malformed = run(server.qjudge_appeals("get", CONTEST, DummyContext(), appeal_id=7))
    assert malformed["error"] is True
    assert malformed["status"] == 502


@pytest.mark.parametrize("content", ["可", "字" * 5000, "請看  第二段\n原文"])
def test_send_accepts_boundary_content(monkeypatch, content):
    def responder(method, path, body):
        payload = detail()
        payload["messages"] = [
            *payload["messages"],
            {
                "id": 4,
                "author_id": 3,
                "author_username": "stu",
                "content": body["content"],
                "created_at": "2026-11-03T00:00:00Z",
            },
        ]
        return {"data": payload, "meta": {}}

    calls = route(monkeypatch, responder)

    result = run(server.qjudge_appeals("send", CONTEST, DummyContext(), appeal_id=7, content=content))

    assert calls[1]["json_body"] == {"content": content}
    assert result["message"]["content"] == content
    assert set(result) == {"status", "appeal_id", "appeal_status", "message"}


def test_send_rejects_a_success_body_without_the_new_comment(monkeypatch):
    payload = detail()
    payload["messages"] = []
    route(monkeypatch, lambda method, path, body: {"data": payload, "meta": {}})

    result = run(server.qjudge_appeals("send", CONTEST, DummyContext(), appeal_id=7, content="請複核"))

    assert result["error"] is True
    assert result["status"] == 502
    assert "comment" in result["detail"]


def test_contest_lookup_error_is_returned_before_appeal_routes(monkeypatch):
    calls = []
    error = {
        "error": True,
        "errors": [{"code": "permission_denied", "message": "無法存取此考試。"}],
        "status": 403,
    }

    async def fake_django_api(method, path, ctx, *, json_body=None, timeout=30.0):
        calls.append(path)
        return error

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_appeals("send", CONTEST, DummyContext(), appeal_id=7, content="請複核"))

    assert result == error
    assert calls == [f"/api/v1/contests/{CONTEST}/"]


def test_non_object_contest_payload_is_rejected(monkeypatch):
    async def fake_django_api(method, path, ctx, *, json_body=None, timeout=30.0):
        return ["paper_exam"]

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_appeals("list", CONTEST, DummyContext()))

    assert result["status"] == 400
    assert "None" in result["detail"]


@pytest.mark.parametrize(
    ("action", "contest_id", "kwargs", "detail"),
    [
        ("close", CONTEST, {"appeal_id": 7, "content": "結案"}, "Unknown action: close"),
        ("list", "", {}, "contest_id is required"),
        ("send", CONTEST, {"appeal_id": 7, "content": ""}, "content is required"),
    ],
)
def test_rejects_unknown_action_missing_contest_and_empty_content(
    monkeypatch, action, contest_id, kwargs, detail,
):
    calls = route(monkeypatch, lambda method, path, body: {"data": detail(), "meta": {}})

    result = run(server.qjudge_appeals(action, contest_id, DummyContext(), **kwargs))

    assert result["error"] is True
    assert result["detail"].startswith(detail)
    assert calls == []
