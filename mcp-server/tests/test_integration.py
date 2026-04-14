"""
MCP Server integration tests — hit real Django API.

Prerequisites (test stack):
  docker compose -f docker-compose.test.yml up -d --build

Prerequisites (dev stack):
  Already running on localhost:8000

Run:
  DJANGO_BASE_URL=http://localhost:8000 pytest tests/test_integration.py -v
  DJANGO_BASE_URL=http://localhost:8002 pytest tests/test_integration.py -v
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import pytest
import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://localhost:8002")

# Skip entire module if backend is unreachable
def _backend_reachable() -> bool:
    try:
        r = httpx.get(f"{DJANGO_BASE_URL}/api/v1/auth/me", timeout=3)
        return r.status_code in (200, 401, 403)
    except (httpx.ConnectError, httpx.TimeoutException):
        return False

pytestmark = pytest.mark.skipif(
    not _backend_reachable(),
    reason=f"Django backend not reachable at {DJANGO_BASE_URL}",
)

os.environ["DJANGO_BASE_URL"] = DJANGO_BASE_URL
os.environ["DJANGO_FORWARDED_PROTO"] = "http"

import server  # noqa: E402


def run(coro):
    return asyncio.run(coro)


def _unwrap_paginated(result):
    """Handle both list and paginated dict responses."""
    if isinstance(result, list):
        return result
    if isinstance(result, dict) and "results" in result:
        return result["results"]
    return result


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _get_token(role: str = "teacher") -> str:
    """Get auth token via dev/token endpoint or email login."""
    dev_resp = httpx.post(
        f"{DJANGO_BASE_URL}/api/v1/auth/dev/token",
        json={"role": role},
        timeout=10,
    )
    if dev_resp.status_code == 200:
        data = dev_resp.json()
        inner = data.get("data", data)
        return inner.get("access_token") or inner.get("access")

    seed_credentials = {
        "teacher": ("teacher@example.com", "teacher123"),
        "student": ("student@example.com", "student123"),
    }
    cred = seed_credentials.get(role)
    assert cred, f"No credentials for role={role}"
    resp = httpx.post(
        f"{DJANGO_BASE_URL}/api/v1/auth/email/login",
        json={"email": cred[0], "password": cred[1]},
        timeout=10,
    )
    assert resp.status_code == 200, f"Login failed ({resp.status_code})"
    return resp.json()["data"]["access_token"]


class _AuthContext:
    """Minimal MCP Context carrying a real auth token."""
    def __init__(self, token: str):
        self._token = token

    @property
    def request_context(self):
        return self

    @property
    def request(self):
        return self

    @property
    def headers(self):
        return {"authorization": f"Bearer {self._token}"}


@pytest.fixture(scope="module")
def teacher_token():
    return _get_token("teacher")

@pytest.fixture(scope="module")
def student_token():
    return _get_token("student")

@pytest.fixture(scope="module")
def teacher_ctx(teacher_token):
    return _AuthContext(teacher_token)

@pytest.fixture(scope="module")
def student_ctx(student_token):
    return _AuthContext(student_token)


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

class TestTokenVerification:
    def test_valid_token(self, teacher_token):
        result = run(server.DjangoTokenVerifier().verify_token(teacher_token))
        assert result is not None
        assert result.token == teacher_token

    def test_invalid_token(self):
        result = run(server.DjangoTokenVerifier().verify_token("invalid-xxx"))
        assert result is None


# ---------------------------------------------------------------------------
# qjudge_browse
# ---------------------------------------------------------------------------

class TestBrowse:
    def test_list_classrooms_returns_list(self, teacher_ctx):
        result = run(server.qjudge_browse("list_classrooms", teacher_ctx))
        items = _unwrap_paginated(result)
        assert isinstance(items, list)

    def test_list_contests_returns_list(self, teacher_ctx):
        result = run(server.qjudge_browse("list_contests", teacher_ctx))
        items = _unwrap_paginated(result)
        assert isinstance(items, list)

    def test_get_contest_by_id(self, teacher_ctx):
        result = run(server.qjudge_browse("list_contests", teacher_ctx))
        items = _unwrap_paginated(result)
        if not items:
            pytest.fail("No contests available")
        cid = str(items[0]["id"])
        detail = run(server.qjudge_browse("get_contest", teacher_ctx, contest_id=cid))
        assert not (isinstance(detail, dict) and detail.get("error"))
        assert detail.get("id") is not None

    def test_browse_banks_returns_list(self, teacher_ctx):
        result = run(server.qjudge_browse("browse_banks", teacher_ctx))
        items = _unwrap_paginated(result)
        assert isinstance(items, list)

    def test_student_classroom_scope(self, student_ctx):
        result = run(server.qjudge_browse("list_classrooms", student_ctx))
        items = _unwrap_paginated(result)
        # Student has no manage scope — should be empty list
        assert isinstance(items, list)
        assert len(items) == 0


# ---------------------------------------------------------------------------
# qjudge_exam
# ---------------------------------------------------------------------------

class TestExam:
    @pytest.fixture(scope="class")
    def contest_id(self, teacher_ctx):
        result = run(server.qjudge_browse("list_contests", teacher_ctx))
        items = _unwrap_paginated(result)
        # Find a paper_exam contest, or any contest
        target = next(
            (c for c in items if c.get("contest_type") == "paper_exam"),
            items[0] if items else None,
        )
        if not target:
            pytest.fail("No contests available")
        return str(target["id"])

    def test_list_questions(self, teacher_ctx, contest_id):
        result = run(server.qjudge_exam("list", contest_id, teacher_ctx))
        assert isinstance(result, list)

    def test_get_question(self, teacher_ctx, contest_id):
        questions = run(server.qjudge_exam("list", contest_id, teacher_ctx))
        if not questions:
            pytest.fail("No exam questions")
        qid = str(questions[0]["id"])
        detail = run(server.qjudge_exam("get", contest_id, teacher_ctx, question_id=qid))
        assert not (isinstance(detail, dict) and detail.get("error"))


# ---------------------------------------------------------------------------
# qjudge_coding
# ---------------------------------------------------------------------------

class TestCoding:
    @pytest.fixture(scope="class")
    def contest_with_problems(self, teacher_ctx):
        """Find any contest that has at least one coding problem."""
        result = run(server.qjudge_browse("list_contests", teacher_ctx))
        contests = _unwrap_paginated(result)
        for c in contests:
            cid = str(c["id"])
            raw = run(server.qjudge_coding("list", teacher_ctx, contest_id=cid))
            problems = _unwrap_paginated(raw)
            if isinstance(problems, list) and problems:
                return cid, problems
        pytest.fail("No contest with coding problems found in seed data")

    def test_list_and_get_problem(self, teacher_ctx, contest_with_problems):
        contest_id, problems = contest_with_problems
        assert len(problems) >= 1
        pid = str(problems[0]["id"])
        detail = run(server.qjudge_coding("get", teacher_ctx, contest_id=contest_id, problem_id=pid))
        assert not (isinstance(detail, dict) and detail.get("error"))
        assert detail.get("id") is not None


# ---------------------------------------------------------------------------
# qjudge_grading
# ---------------------------------------------------------------------------

class TestGrading:
    @pytest.fixture(scope="class")
    def contest_id(self, teacher_ctx):
        result = run(server.qjudge_browse("list_contests", teacher_ctx))
        items = _unwrap_paginated(result)
        if not items:
            pytest.fail("No contests")
        return str(items[0]["id"])

    def test_dashboard(self, teacher_ctx, contest_id):
        result = run(server.qjudge_grading("dashboard", contest_id, teacher_ctx))
        assert isinstance(result, dict)
        assert not result.get("error")

    def test_list_answers(self, teacher_ctx, contest_id):
        result = run(server.qjudge_grading("list_answers", contest_id, teacher_ctx))
        assert isinstance(result, (list, dict))


# ---------------------------------------------------------------------------
# MCP Protocol — in-memory client ↔ server session
# ---------------------------------------------------------------------------

class TestMCPProtocol:
    """Verify the MCP server works at protocol level via in-memory transport."""

    EXPECTED_TOOLS = {"qjudge_browse", "qjudge_bank", "qjudge_exam", "qjudge_grading", "qjudge_coding", "qjudge_code_runner"}

    def test_list_tools(self):
        from mcp.shared.memory import create_connected_server_and_client_session

        async def _test():
            async with create_connected_server_and_client_session(server.mcp) as client:
                await client.initialize()
                result = await client.list_tools()
                tool_names = {t.name for t in result.tools}
                return tool_names

        names = run(_test())
        assert self.EXPECTED_TOOLS.issubset(names), f"Missing tools: {self.EXPECTED_TOOLS - names}"

    def test_tool_schemas_have_required_fields(self):
        from mcp.shared.memory import create_connected_server_and_client_session

        async def _test():
            async with create_connected_server_and_client_session(server.mcp) as client:
                await client.initialize()
                result = await client.list_tools()
                return result.tools

        tools = run(_test())
        # Tools that use action-based routing
        action_tools = self.EXPECTED_TOOLS - {"qjudge_code_runner"}
        for tool in tools:
            if tool.name not in self.EXPECTED_TOOLS:
                continue
            schema = tool.inputSchema
            assert "properties" in schema, f"{tool.name} missing properties in schema"
            if tool.name in action_tools:
                assert "action" in schema["properties"], f"{tool.name} missing 'action' param"
            else:
                # qjudge_code_runner has direct params, no action
                assert "problem_id" in schema["properties"], f"{tool.name} missing 'problem_id' param"

    def test_call_tool_with_invalid_action_returns_error(self):
        from mcp.shared.memory import create_connected_server_and_client_session

        async def _test():
            async with create_connected_server_and_client_session(
                server.mcp, raise_exceptions=True
            ) as client:
                await client.initialize()
                result = await client.call_tool(
                    "qjudge_browse",
                    arguments={"action": "nonexistent_action"},
                )
                return result

        result = run(_test())
        text = result.content[0].text if result.content else ""
        parsed = json.loads(text) if text else {}
        assert parsed.get("error"), f"Expected error response, got: {text[:200]}"

    def test_call_tool_discover_list_classrooms(self, teacher_token):
        from mcp.shared.memory import create_connected_server_and_client_session

        async def _test():
            async with create_connected_server_and_client_session(server.mcp) as client:
                await client.initialize()
                result = await client.call_tool(
                    "qjudge_browse",
                    arguments={"action": "list_classrooms"},
                )
                return result

        # Note: without auth context, the tool will fail with auth error.
        # This verifies the MCP protocol round-trip works, even if the
        # tool returns an API error (no auth header in in-memory transport).
        result = run(_test())
        assert result.content, "Expected non-empty content from tool call"
        text = result.content[0].text
        # Should be valid JSON (either data or error)
        parsed = json.loads(text)
        assert isinstance(parsed, (list, dict))
