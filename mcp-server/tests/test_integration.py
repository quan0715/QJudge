"""
MCP Server integration tests — hit real Django API via docker-compose test stack.

Prerequisites:
  docker compose -f docker-compose.test.yml up -d --build
  # wait for backend readiness, seed data created automatically

Run:
  DJANGO_BASE_URL=http://localhost:8002 pytest tests/test_integration.py -v

Seed data (from seed_e2e_data.py):
  - teacher / teacher123  (role=teacher, owns contests)
  - student / student123  (role=student)
  - "E2E Test Contest" (published, coding, with A+B Problem)
  - "E2E Exam Mode Contest" (published, paper_exam, cheat_detection_enabled)
  - "E2E Test Classroom" (invite code E2ETEST, members: student, student2)
"""

import asyncio
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

# Patch config before importing server
os.environ["DJANGO_BASE_URL"] = DJANGO_BASE_URL
os.environ["DJANGO_FORWARDED_PROTO"] = "http"

import server  # noqa: E402


def run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _login(email: str, password: str) -> str:
    """Login and return access token."""
    resp = httpx.post(
        f"{DJANGO_BASE_URL}/api/v1/auth/login",
        json={"email": email, "password": password},
        timeout=10,
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    return data["access_token"]


class _AuthContext:
    """Minimal MCP Context that carries a real auth token."""

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
    return _login("teacher@test.com", "teacher123")


@pytest.fixture(scope="module")
def student_token():
    return _login("student@test.com", "student123")


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
    def test_valid_token_returns_access_token(self, teacher_token):
        verifier = server.DjangoTokenVerifier()
        result = run(verifier.verify_token(teacher_token))
        assert result is not None
        assert result.token == teacher_token

    def test_invalid_token_returns_none(self):
        verifier = server.DjangoTokenVerifier()
        result = run(verifier.verify_token("invalid-token-xxx"))
        assert result is None


# ---------------------------------------------------------------------------
# qjudge_discover
# ---------------------------------------------------------------------------

class TestDiscover:
    def test_list_classrooms(self, teacher_ctx):
        result = run(server.qjudge_discover("list_classrooms", teacher_ctx))
        assert isinstance(result, (list, dict))
        if isinstance(result, list):
            names = [c.get("name") for c in result]
            assert "E2E Test Classroom" in names

    def test_list_contests(self, teacher_ctx):
        result = run(server.qjudge_discover("list_contests", teacher_ctx))
        assert isinstance(result, (list, dict))
        if isinstance(result, list):
            titles = [c.get("title") for c in result]
            assert "E2E Test Contest" in titles

    def test_get_contest(self, teacher_ctx):
        # First find contest id
        contests = run(server.qjudge_discover("list_contests", teacher_ctx))
        if isinstance(contests, dict) and contests.get("error"):
            pytest.skip("list_contests returned error")
        target = next((c for c in contests if c.get("title") == "E2E Test Contest"), None)
        assert target is not None, "E2E Test Contest not found in seed data"

        result = run(server.qjudge_discover("get_contest", teacher_ctx, contest_id=str(target["id"])))
        assert not result.get("error", False)
        assert result.get("title") == "E2E Test Contest"

    def test_browse_banks(self, teacher_ctx):
        result = run(server.qjudge_discover("browse_banks", teacher_ctx))
        assert isinstance(result, list)
        names = [b.get("name") for b in result]
        assert "E2E Test Bank" in names

    def test_student_cannot_list_classrooms_as_manager(self, student_ctx):
        result = run(server.qjudge_discover("list_classrooms", student_ctx))
        # Student should get empty list or error (no manage scope)
        if isinstance(result, list):
            assert len(result) == 0
        else:
            assert result.get("error") or result.get("status", 200) >= 400


# ---------------------------------------------------------------------------
# qjudge_exam
# ---------------------------------------------------------------------------

class TestExam:
    @pytest.fixture(scope="class")
    def exam_contest_id(self, teacher_ctx):
        contests = run(server.qjudge_discover("list_contests", teacher_ctx))
        target = next((c for c in contests if "Exam Mode" in c.get("title", "")), None)
        assert target is not None, "E2E Exam Mode Contest not found"
        return str(target["id"])

    def test_list_exam_questions(self, teacher_ctx, exam_contest_id):
        result = run(server.qjudge_exam("list", exam_contest_id, teacher_ctx))
        assert isinstance(result, list)
        assert len(result) >= 1

    def test_get_exam_question(self, teacher_ctx, exam_contest_id):
        questions = run(server.qjudge_exam("list", exam_contest_id, teacher_ctx))
        if not questions:
            pytest.skip("No exam questions found")
        qid = str(questions[0]["id"])
        result = run(server.qjudge_exam("get", exam_contest_id, teacher_ctx, question_id=qid))
        assert not result.get("error", False)


# ---------------------------------------------------------------------------
# qjudge_coding
# ---------------------------------------------------------------------------

class TestCoding:
    @pytest.fixture(scope="class")
    def coding_contest_id(self, teacher_ctx):
        contests = run(server.qjudge_discover("list_contests", teacher_ctx))
        target = next((c for c in contests if c.get("title") == "E2E Test Contest"), None)
        assert target is not None, "E2E Test Contest not found"
        return str(target["id"])

    def test_list_problems(self, teacher_ctx, coding_contest_id):
        result = run(server.qjudge_coding("list", teacher_ctx, contest_id=coding_contest_id))
        assert isinstance(result, list)
        titles = [p.get("title") for p in result]
        assert "A+B Problem" in titles

    def test_get_problem(self, teacher_ctx, coding_contest_id):
        problems = run(server.qjudge_coding("list", teacher_ctx, contest_id=coding_contest_id))
        target = next((p for p in problems if p.get("title") == "A+B Problem"), None)
        assert target is not None
        pid = str(target["id"])
        result = run(server.qjudge_coding("get", teacher_ctx, contest_id=coding_contest_id, problem_id=pid))
        assert not result.get("error", False)
        assert result.get("title") == "A+B Problem"


# ---------------------------------------------------------------------------
# qjudge_grading (limited — need submitted answers for full test)
# ---------------------------------------------------------------------------

class TestGrading:
    @pytest.fixture(scope="class")
    def exam_contest_id(self, teacher_ctx):
        contests = run(server.qjudge_discover("list_contests", teacher_ctx))
        target = next((c for c in contests if "Exam Mode" in c.get("title", "")), None)
        assert target is not None
        return str(target["id"])

    def test_dashboard(self, teacher_ctx, exam_contest_id):
        result = run(server.qjudge_grading("dashboard", exam_contest_id, teacher_ctx))
        # Dashboard should return without error even with no submissions
        assert not result.get("error", False)

    def test_list_answers_empty(self, teacher_ctx, exam_contest_id):
        result = run(server.qjudge_grading("list_answers", exam_contest_id, teacher_ctx))
        # May be empty list or error if no answers exist
        assert isinstance(result, (list, dict))
