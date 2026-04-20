"""Tests for session-private artifact LangChain tools."""
from __future__ import annotations

import asyncio
import os
import sys
import types

os.environ.setdefault("AI_INTERNAL_TOKEN", "test-ai-internal-token")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-deepseek-key")

_deepseek_stub = types.ModuleType("langchain_deepseek")


class _ChatDeepSeekStub:  # pragma: no cover - import stub only
    pass


_deepseek_stub.ChatDeepSeek = _ChatDeepSeekStub
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)

from services.artifact_tools import build_artifact_tools  # noqa: E402


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _tool(tools, name):
    for t in tools:
        if t.name == name:
            return t
    raise AssertionError(f"tool {name} not found")


class _StubResponse:
    def __init__(self, status_code=200, json_data=None, content=b""):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}
        self.content = content
        self.text = ""

    def json(self):
        return self._json


class _StubClient:
    """Minimal drop-in replacement for httpx.AsyncClient used in these tools."""

    def __init__(self, responses):
        # responses: list of dicts with keys {method, url_contains, status, json, content}
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    def _next(self, method, url):
        assert self._responses, f"no stub response queued for {method} {url}"
        spec = self._responses.pop(0)
        assert spec["method"] == method, (spec, method)
        if "url_contains" in spec:
            assert spec["url_contains"] in url, (spec, url)
        return _StubResponse(
            status_code=spec.get("status", 200),
            json_data=spec.get("json"),
            content=spec.get("content", b""),
        )

    async def post(self, url, json=None, headers=None):
        self.calls.append({"method": "POST", "url": url, "json": json, "headers": headers})
        return self._next("POST", url)

    async def get(self, url, params=None, headers=None):
        self.calls.append({"method": "GET", "url": url, "params": params, "headers": headers})
        return self._next("GET", url)


def _patch_httpx(monkeypatch, stub):
    import services.artifact_tools as mod

    class _Factory:
        def __init__(self, *a, **kw):
            self._stub = stub

        async def __aenter__(self):
            return self._stub

        async def __aexit__(self, *a):
            return None

    monkeypatch.setattr(mod.httpx, "AsyncClient", _Factory)
    return stub


def _tools(session_id="sess-1", run_id="run-1"):
    return build_artifact_tools(
        session_id=session_id,
        run_id=run_id,
        backend_base_url="http://backend",
        internal_token="test-token",
    )


def test_write_posts_expected_payload(monkeypatch):
    stub = _StubClient([
        {
            "method": "POST",
            "url_contains": "/_internal/artifacts/",
            "status": 201,
            "json": {"id": "a-1", "step": "rubric", "filename": "rubric.json"},
        }
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write")
    result = _run(tool.coroutine(
        step="rubric",
        filename="rubric.json",
        content='{"v": 1}',
        content_type="application/json",
    ))
    assert result["id"] == "a-1"
    call = stub.calls[0]
    assert call["json"]["session_id"] == "sess-1"
    assert call["json"]["run_id"] == "run-1"
    assert call["json"]["step"] == "rubric"
    assert call["headers"]["X-AI-Internal-Token"] == "test-token"


def test_write_returns_error_on_400(monkeypatch):
    stub = _StubClient([
        {"method": "POST", "status": 400, "json": {"detail": "bad filename"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write")
    result = _run(tool.coroutine(
        step="rubric", filename="../bad", content="x",
    ))
    assert result["is_error"] is True
    assert result["status"] == 400


def test_list_filters_and_returns_results(monkeypatch):
    stub = _StubClient([
        {
            "method": "GET",
            "url_contains": "/_internal/artifacts/",
            "status": 200,
            "json": [{"id": "a-1"}, {"id": "a-2"}],
        }
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_list")
    result = _run(tool.coroutine(step="rubric"))
    assert [a["id"] for a in result["artifacts"]] == ["a-1", "a-2"]
    call = stub.calls[0]
    assert call["params"]["session_id"] == "sess-1"
    assert call["params"]["step"] == "rubric"


def test_read_fetches_content_after_listing(monkeypatch):
    stub = _StubClient([
        {
            "method": "GET",
            "url_contains": "/_internal/artifacts/",
            "status": 200,
            "json": [
                {
                    "id": "a-1",
                    "step": "rubric",
                    "filename": "rubric.json",
                    "content_type": "application/json",
                }
            ],
        },
        {
            "method": "GET",
            "url_contains": "/a-1/content/",
            "status": 200,
            "content": b'{"a":1}',
        },
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_read")
    result = _run(tool.coroutine(step="rubric", filename="rubric.json"))
    assert result["content"] == '{"a":1}'
    assert result["metadata"]["id"] == "a-1"


def test_read_paginates_by_offset_and_limit(monkeypatch):
    body = b"line0\nline1\nline2\nline3\nline4\n"
    stub = _StubClient([
        {
            "method": "GET",
            "url_contains": "/_internal/artifacts/",
            "status": 200,
            "json": [
                {"id": "a-1", "step": "s", "filename": "f", "content_type": "text/plain"},
            ],
        },
        {
            "method": "GET",
            "url_contains": "/a-1/content/",
            "status": 200,
            "content": body,
        },
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_read")
    result = _run(tool.coroutine(step="s", filename="f", offset=1, limit=2))
    assert result["content"] == "line1\nline2\n"
    assert result["total_lines"] == 5


def test_read_missing_returns_error(monkeypatch):
    stub = _StubClient([
        {"method": "GET", "status": 200, "json": []},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_read")
    result = _run(tool.coroutine(step="rubric", filename="missing.json"))
    assert result["is_error"] is True


def test_tools_without_session_return_error():
    tools = build_artifact_tools(
        session_id=None,
        run_id=None,
        backend_base_url="http://backend",
        internal_token="t",
    )
    for name in ("artifact_write", "artifact_list", "artifact_read", "artifact_write_csv"):
        tool = _tool(tools, name)
        if name == "artifact_write":
            result = _run(tool.coroutine(step="s", filename="f", content="c"))
        elif name == "artifact_list":
            result = _run(tool.coroutine())
        elif name == "artifact_write_csv":
            result = _run(tool.coroutine(step="s", filename="f.csv", columns=["a"], rows=[]))
        else:
            result = _run(tool.coroutine(step="s", filename="f"))
        assert result["is_error"] is True
        assert "session_id" in result["detail"]


def test_write_csv_quotes_tricky_fields(monkeypatch):
    captured_content = {}

    stub = _StubClient([
        {
            "method": "POST",
            "url_contains": "/_internal/artifacts/",
            "status": 201,
            "json": {"id": "a-csv", "step": "raw_answers", "filename": "raw_answers.csv"},
        }
    ])
    _patch_httpx(monkeypatch, stub)

    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="raw_answers",
        filename="raw_answers.csv",
        columns=["exam_answer_id", "student_id", "original_score", "answer_text"],
        rows=[
            {
                "exam_answer_id": 1820,
                "student_id": 92,
                "original_score": "1.00",
                "answer_text": "line 1,還有逗號\nline 2 \"引號\"",
            },
            {
                "exam_answer_id": 2105,
                "student_id": 181,
                "original_score": "0.00",
                "answer_text": "simple",
            },
        ],
    ))

    assert result["id"] == "a-csv"
    posted = stub.calls[0]["json"]
    content = posted["content"]
    captured_content["body"] = content

    lines = content.split("\n")
    assert lines[0] == '"exam_answer_id","student_id","original_score","answer_text"'
    # Row 1 answer_text has comma, newline, and quote → must be one CSV field
    # spanning two physical lines with doubled inner quotes.
    assert '"1820","92","1.00","line 1,還有逗號' in content
    assert 'line 2 ""引號"""' in content
    # Row 2 is simple but QUOTE_ALL still wraps every field.
    assert '"2105","181","0.00","simple"' in content

    assert posted["content_type"] == "text/csv; charset=utf-8"
    assert posted["metadata"]["artifact_type"] == "csv"
    assert posted["metadata"]["csv_columns"] == [
        "exam_answer_id", "student_id", "original_score", "answer_text",
    ]
    assert posted["metadata"]["csv_row_count"] == 2


def test_write_csv_rejects_empty_columns():
    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="raw_answers", filename="x.csv", columns=[], rows=[{"a": 1}],
    ))
    assert result["is_error"] is True
    assert "columns" in result["detail"]


def test_write_csv_rejects_non_dict_row():
    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="raw_answers", filename="x.csv",
        columns=["a"], rows=["not a dict"],
    ))
    assert result["is_error"] is True
    assert "row[0]" in result["detail"]


def test_write_csv_decodes_json_stringified_columns(monkeypatch):
    """DeepSeek sometimes serializes arrays as JSON strings. Accept + log warning."""
    stub = _StubClient([
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="answers",
        filename="answers.csv",
        columns='["a","b","c"]',   # ← stringified array (the bug shape)
        rows=[{"a": 1, "b": 2, "c": 3}],
    ))
    assert result.get("is_error") is not True, result
    body = stub.calls[0]["json"]["content"]
    lines = body.split("\n")
    # Header is the three real columns, not 13 single-char columns.
    assert lines[0] == '"a","b","c"'
    assert lines[1] == '"1","2","3"'


def test_write_csv_rejects_non_list_non_string_columns():
    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="answers", filename="x.csv",
        columns=42, rows=[{"a": 1}],
    ))
    assert result["is_error"] is True
    assert "must be an array" in result["detail"]


def test_write_csv_rejects_malformed_string_columns():
    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="answers", filename="x.csv",
        columns='not json at all', rows=[{"a": 1}],
    ))
    assert result["is_error"] is True


def test_write_csv_rejects_non_string_column_names():
    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="answers", filename="x.csv",
        columns=["a", 42, "c"], rows=[{"a": 1}],
    ))
    assert result["is_error"] is True
    assert "column name" in result["detail"]


def test_write_csv_decodes_json_stringified_rows(monkeypatch):
    stub = _StubClient([
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write_csv")
    result = _run(tool.coroutine(
        step="answers", filename="x.csv",
        columns=["a", "b"],
        rows='[{"a": 1, "b": 2}]',   # ← stringified too
    ))
    assert result.get("is_error") is not True, result
    body = stub.calls[0]["json"]["content"]
    assert '"1","2"' in body


def test_write_csv_from_records_basic_mapping(monkeypatch):
    stub = _StubClient([
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write_csv_from_records")
    _run(tool.coroutine(
        step="answers",
        filename="answers.csv",
        records=[
            {"exam_answer_id": 1820, "username": "313554060",
             "answer": {"text": "ans1,含逗號"}, "score": "1.00"},
            {"exam_answer_id": 2105, "username": "414551016",
             "answer": {"text": "ans2"}, "score": "0.00"},
        ],
        column_mapping={
            "exam_answer_id": "exam_answer_id",
            "student_id":     "username",
            "answer_text":    "answer.text",
            "original_score": "score",
        },
        defaults={"new_score": "", "reason": ""},
    ))
    body = stub.calls[0]["json"]["content"]
    lines = body.split("\n")
    # Columns: mapping keys first (in insertion order), defaults last
    assert lines[0] == '"exam_answer_id","student_id","answer_text","original_score","new_score","reason"'
    # Dot-path resolved nested value; comma in text gets QUOTE_ALL-wrapped
    assert '"1820","313554060","ans1,含逗號","1.00","",""' in body
    assert '"2105","414551016","ans2","0.00","",""' in body


def test_write_csv_from_records_accepts_json_string(monkeypatch):
    """Simulates the offload-then-read_file case: agent passes file content as string."""
    stub = _StubClient([
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write_csv_from_records")
    _run(tool.coroutine(
        step="answers",
        filename="answers.csv",
        records='[{"exam_answer_id": 1, "username": "u1", "answer": {"text": "t1"}, "score": "1"}]',
        column_mapping='{"exam_answer_id":"exam_answer_id","student_id":"username","answer_text":"answer.text","original_score":"score"}',
        defaults={"new_score": "", "reason": ""},
    ))
    body = stub.calls[0]["json"]["content"]
    assert '"1","u1","t1","1","",""' in body


def test_write_csv_from_records_missing_path_yields_empty(monkeypatch):
    stub = _StubClient([
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write_csv_from_records")
    _run(tool.coroutine(
        step="answers", filename="x.csv",
        records=[{"a": 1}],   # missing "b" entirely, and "c.d" nested path
        column_mapping={"col_a": "a", "col_b": "b", "col_cd": "c.d"},
    ))
    body = stub.calls[0]["json"]["content"]
    lines = body.split("\n")
    assert lines[0] == '"col_a","col_b","col_cd"'
    assert lines[1] == '"1","",""'


def test_write_csv_from_records_rejects_non_dict_record():
    tool = _tool(_tools(), "artifact_write_csv_from_records")
    result = _run(tool.coroutine(
        step="answers", filename="x.csv",
        records=[{"a": 1}, "not a dict"],
        column_mapping={"col_a": "a"},
    ))
    assert result["is_error"] is True
    assert "records[1]" in result["detail"]


def test_write_csv_from_records_identity_mapping(monkeypatch):
    """If column_mapping is omitted and records already match CSV shape, use keys as-is."""
    stub = _StubClient([
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write_csv_from_records")
    _run(tool.coroutine(
        step="answers", filename="answers.csv",
        records=[
            {"exam_answer_id": 1, "student_id": "u1", "answer_text": "t1", "original_score": "1"},
            {"exam_answer_id": 2, "student_id": "u2", "answer_text": "t2", "original_score": "2"},
        ],
        defaults={"new_score": "", "reason": ""},
    ))
    body = stub.calls[0]["json"]["content"]
    lines = body.split("\n")
    assert lines[0] == '"exam_answer_id","student_id","answer_text","original_score","new_score","reason"'
    assert '"1","u1","t1","1","",""' in body
    assert '"2","u2","t2","2","",""' in body


def test_patch_csv_rows_merges_updates_and_preserves_others(monkeypatch):
    """Patch only the batch you graded — other rows must survive."""
    seed_body = (
        '"exam_answer_id","username","score","reason"\n'
        '"1","alice","",""\n'
        '"2","bob","",""\n'
        '"3","charlie","",""\n'
    )
    stub = _StubClient([
        # _artifact_read: first list, then content
        {"method": "GET", "url_contains": "/_internal/artifacts/", "status": 200,
         "json": [{"id": "a-1", "step": "grade", "filename": "grade.csv", "content_type": "text/csv"}]},
        {"method": "GET", "url_contains": "/a-1/content/", "status": 200,
         "content": seed_body.encode("utf-8")},
        # _artifact_write_csv → POST
        {"method": "POST", "url_contains": "/_internal/artifacts/", "status": 201,
         "json": {"id": "a-1", "size_bytes": 999}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_patch_csv_rows")
    result = _run(tool.coroutine(
        step="grade", filename="grade.csv",
        key_column="exam_answer_id",
        updates=[
            {"exam_answer_id": 1, "score": "5", "reason": "完整"},
            {"exam_answer_id": 3, "score": "2", "reason": "缺關鍵"},
        ],
    ))
    assert result["updated"] == 2
    assert result["missing"] == []
    assert result["total_rows"] == 3
    # The write payload should still contain all 3 rows, two updated.
    post_body = stub.calls[-1]["json"]["content"]
    assert '"1","alice","5","完整"' in post_body
    assert '"2","bob","",""' in post_body         # untouched row preserved
    assert '"3","charlie","2","缺關鍵"' in post_body


def test_patch_csv_rows_reports_missing_keys(monkeypatch):
    seed_body = '"exam_answer_id","score"\n"1",""\n'
    stub = _StubClient([
        {"method": "GET", "status": 200, "json": [{"id": "a", "step": "g", "filename": "g.csv", "content_type": "text/csv"}]},
        {"method": "GET", "status": 200, "content": seed_body.encode("utf-8")},
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_patch_csv_rows")
    result = _run(tool.coroutine(
        step="g", filename="g.csv", key_column="exam_answer_id",
        updates=[
            {"exam_answer_id": 1, "score": "5"},
            {"exam_answer_id": 999, "score": "5"},
        ],
    ))
    assert result["updated"] == 1
    assert result["missing"] == ["999"]


def test_patch_csv_rows_rejects_missing_key_column(monkeypatch):
    seed_body = '"id","score"\n"1",""\n'
    stub = _StubClient([
        {"method": "GET", "status": 200, "json": [{"id": "a", "step": "g", "filename": "g.csv", "content_type": "text/csv"}]},
        {"method": "GET", "status": 200, "content": seed_body.encode("utf-8")},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_patch_csv_rows")
    result = _run(tool.coroutine(
        step="g", filename="g.csv", key_column="exam_answer_id",
        updates=[{"exam_answer_id": 1, "score": "5"}],
    ))
    assert result["is_error"] is True
    assert "key_column" in result["detail"]


def test_patch_csv_rows_accepts_stringified_updates(monkeypatch):
    seed_body = '"id","score"\n"1",""\n'
    stub = _StubClient([
        {"method": "GET", "status": 200, "json": [{"id": "a", "step": "g", "filename": "g.csv", "content_type": "text/csv"}]},
        {"method": "GET", "status": 200, "content": seed_body.encode("utf-8")},
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_patch_csv_rows")
    result = _run(tool.coroutine(
        step="g", filename="g.csv", key_column="id",
        updates='[{"id": 1, "score": "9"}]',
    ))
    assert result["updated"] == 1


def test_write_csv_from_records_identity_rejects_empty_records():
    tool = _tool(_tools(), "artifact_write_csv_from_records")
    result = _run(tool.coroutine(
        step="answers", filename="x.csv",
        records=[],
    ))
    assert result["is_error"] is True
    assert "cannot infer" in result["detail"]


def test_write_csv_from_records_rejects_empty_mapping():
    tool = _tool(_tools(), "artifact_write_csv_from_records")
    result = _run(tool.coroutine(
        step="answers", filename="x.csv",
        records=[{"a": 1}],
        column_mapping={},
    ))
    assert result["is_error"] is True


def test_write_csv_fills_missing_columns_with_empty(monkeypatch):
    stub = _StubClient([
        {"method": "POST", "status": 201, "json": {"id": "a"}},
    ])
    _patch_httpx(monkeypatch, stub)
    tool = _tool(_tools(), "artifact_write_csv")
    _run(tool.coroutine(
        step="raw_answers", filename="x.csv",
        columns=["a", "b", "c"],
        rows=[{"a": 1, "c": 3}],  # b missing
    ))
    body = stub.calls[0]["json"]["content"]
    lines = body.split("\n")
    assert lines[1] == '"1","","3"'
