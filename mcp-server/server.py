"""QJudge MCP Server tools."""

import json
from typing import Any
from urllib.parse import urlencode

import httpx
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP, Context

from config import DJANGO_BASE_URL, MCP_HOST, MCP_PORT, MCP_PUBLIC_URL, OAUTH_ISSUER_URL


class DjangoTokenVerifier(TokenVerifier):
    """Verify OAuth tokens by forwarding to Django backend."""

    async def verify_token(self, token: str) -> AccessToken | None:
        """Check token against Django. Return AccessToken if valid, None if not."""
        try:
            # Derive proto from DJANGO_BASE_URL for correct request.is_secure() behavior
            proto = "https" if DJANGO_BASE_URL.startswith("https://") else "http"
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{DJANGO_BASE_URL}/api/v1/auth/me/",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Forwarded-Proto": proto,
                    },
                )
        except (httpx.RequestError, httpx.TimeoutException):
            return None
        if response.status_code != 200:
            return None
        return AccessToken(
            token=token,
            client_id="qjudge",
            scopes=["mcp"],
        )


async def django_api(
    method: str,
    path: str,
    ctx: Context,
    *,
    json_body: dict | None = None,
) -> Any:
    """Call Django API with OAuth token passthrough."""
    # Derive proto from DJANGO_BASE_URL for correct request.is_secure() behavior
    proto = "https" if DJANGO_BASE_URL.startswith("https://") else "http"
    headers: dict[str, str] = {"X-Forwarded-Proto": proto}
    transport_request = getattr(ctx.request_context, "request", None)
    if transport_request and hasattr(transport_request, "headers"):
        auth_header = transport_request.headers.get("authorization", "")
        if auth_header:
            headers["Authorization"] = auth_header

    url = f"{DJANGO_BASE_URL}{path}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method=method,
            url=url,
            headers=headers,
            json=json_body,
        )

    if response.status_code == 204:
        return {"status": "success"}

    try:
        body = response.json()
    except Exception:
        body = {"raw": response.text}

    if response.status_code >= 400:
        return {
            "error": True,
            "status": response.status_code,
            "detail": body,
        }

    return body


def _error(detail: str, *, status: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"error": True, "detail": detail}
    if status is not None:
        payload["status"] = status
    return payload


def _truncate_text(value: str, limit: int = 120) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def _strip_snapshots(raw: Any) -> Any:
    """Remove large answer snapshot fields from grading payloads."""
    parsed_from_string = False
    try:
        if isinstance(raw, str):
            data = json.loads(raw)
            parsed_from_string = True
        else:
            data = raw
    except (json.JSONDecodeError, TypeError):
        return raw

    def strip(obj: Any) -> Any:
        if isinstance(obj, dict):
            obj.pop("question_snapshot", None)
            obj.pop("correct_answer_snapshot", None)
            return obj
        if isinstance(obj, list):
            for item in obj:
                strip(item)
        return obj

    if isinstance(data, dict) and "responses" in data:
        strip(data.get("responses", []))
    elif isinstance(data, list):
        strip(data)

    if parsed_from_string:
        return json.dumps(data, ensure_ascii=False)
    return data


def _compact_answers(raw: Any) -> Any:
    """Project all-answers response down to grading essentials."""
    data = _strip_snapshots(raw)
    if not isinstance(data, list):
        return data

    compact_rows = []
    for item in data:
        if not isinstance(item, dict):
            compact_rows.append(item)
            continue
        compact_rows.append({
            "exam_answer_id": item.get("id"),
            "question_id": item.get("question_id"),
            "question_prompt": item.get("question_prompt"),
            "question_type": item.get("question_type"),
            "max_score": item.get("max_score"),
            "participant_id": item.get("participant_user_id") or item.get("participant_id"),
            "username": item.get("participant_username"),
            "display_name": item.get("participant_nickname") or item.get("participant_username"),
            "answer": item.get("answer"),
            "is_correct": item.get("is_correct"),
            "score": item.get("score"),
            "feedback": item.get("feedback"),
            "graded_at": item.get("graded_at"),
        })
    return compact_rows


def _compact_question_detail(
    raw: Any,
    *,
    include_participants: bool = False,
    include_omitted: bool = False,
) -> Any:
    """Trim question detail payload for MCP usage."""
    data = _strip_snapshots(raw)
    if not isinstance(data, dict):
        return data

    option_distribution = data.get("option_distribution")
    if isinstance(option_distribution, list) and not include_participants:
        for item in option_distribution:
            if isinstance(item, dict):
                item.pop("participants", None)

    if not include_omitted:
        data.pop("omitted_participants", None)

    return data


def _compact_dashboard(raw: Any, *, include_full_titles: bool = False) -> Any:
    """Trim dashboard payload to avoid sending full prompt text by default."""
    if not isinstance(raw, dict):
        return raw

    questions = raw.get("questions")
    if not isinstance(questions, list):
        return raw

    compact_questions = []
    for item in questions:
        if not isinstance(item, dict):
            compact_questions.append(item)
            continue
        compact_item = dict(item)
        title = compact_item.get("title")
        if isinstance(title, str) and not include_full_titles:
            compact_item["title"] = _truncate_text(title)
        compact_questions.append(compact_item)

    data = dict(raw)
    data["questions"] = compact_questions
    return data


mcp = FastMCP(
    "QJudge",
    host=MCP_HOST,
    port=MCP_PORT,
    stateless_http=True,
    json_response=True,
    auth=AuthSettings(
        issuer_url=OAUTH_ISSUER_URL,
        resource_server_url=MCP_PUBLIC_URL,
    ),
    token_verifier=DjangoTokenVerifier(),
)


# ---------------------------------------------------------------------------
# Tool 1: qjudge_discover — 查詢教室、競賽
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_discover(
    action: str,
    ctx: Context,
    search: str | None = None,
    status: str | None = None,
    contest_id: str | None = None,
    bank_id: str | None = None,
    question_type: str | None = None,
    title: str | None = None,
    prompt: str | None = None,
    difficulty: str | None = None,
    score: int | None = None,
    time_limit: int | None = None,
    memory_limit: int | None = None,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
    coding_ext: dict | None = None,
) -> Any:
    """Discover classrooms, contests, question banks, and create bank questions.

    Actions:
      list_classrooms       — List classrooms you manage
      list_contests         — List contests you manage (optional: search, status)
      get_contest           — Get contest detail (required: contest_id)
      browse_banks          — List your question banks
      browse_bank_questions — List questions in a bank (required: bank_id)
      create_bank_question  — Create a question in a bank (required: bank_id, question_type, title)
                              For coding: include coding_ext {translations, test_cases, language_configs, ...}
    """
    if action == "list_classrooms":
        query = {"scope": "manage"}
        if search:
            query["search"] = search
        return await django_api("GET", f"/api/v1/classrooms/?{urlencode(query)}", ctx)

    if action == "list_contests":
        query: dict[str, str] = {"scope": "manage"}
        if search:
            query["search"] = search
        if status:
            query["status"] = status
        return await django_api("GET", f"/api/v1/contests/?{urlencode(query)}", ctx)

    if action == "get_contest":
        if not contest_id:
            return _error("contest_id is required")
        return await django_api("GET", f"/api/v1/contests/{contest_id}/", ctx)

    if action == "browse_banks":
        return await django_api("GET", "/api/v1/question-banks/", ctx)

    if action == "browse_bank_questions":
        if not bank_id:
            return _error("bank_id is required")
        return await django_api("GET", f"/api/v1/question-banks/{bank_id}/questions/", ctx)

    if action == "create_bank_question":
        if not bank_id:
            return _error("bank_id is required")
        if not question_type:
            return _error("question_type is required")
        if not title:
            return _error("title is required")
        body: dict[str, Any] = {"question_type": question_type, "title": title}
        for key, val in [
            ("prompt", prompt),
            ("difficulty", difficulty),
            ("score", score),
            ("time_limit", time_limit),
            ("memory_limit", memory_limit),
            ("options", options),
            ("correct_answer", correct_answer),
            ("coding_ext", coding_ext),
        ]:
            if val is not None:
                body[key] = val
        return await django_api("POST", f"/api/v1/question-banks/{bank_id}/questions/", ctx, json_body=body)

    return _error(f"Unknown action: {action}")


# ---------------------------------------------------------------------------
# Tool 2: qjudge_exam — 題目 CRUD + reorder
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_exam(
    action: str,
    contest_id: str,
    ctx: Context,
    question_id: str | None = None,
    question_type: str | None = None,
    prompt: str | None = None,
    score: int | None = None,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
    question_ids: list[str] | None = None,
    items: list[dict] | None = None,
) -> Any:
    """Manage exam questions. Actions: list, get, create, update, delete, reorder, import_from_bank."""
    base = f"/api/v1/contests/{contest_id}/exam-questions"

    if action == "list":
        return await django_api("GET", f"{base}/", ctx)

    if action == "get":
        if not question_id:
            return _error("question_id is required")
        return await django_api("GET", f"{base}/{question_id}/", ctx)

    if action == "create":
        body: dict[str, Any] = {}
        if question_type:
            body["question_type"] = question_type
        if prompt:
            body["prompt"] = prompt
        if score is not None:
            body["score"] = score
        if options is not None:
            body["options"] = options
        if correct_answer is not None:
            body["correct_answer"] = correct_answer
        return await django_api("POST", f"{base}/", ctx, json_body=body)

    if action == "update":
        if not question_id:
            return _error("question_id is required")
        body = {}
        if prompt is not None:
            body["prompt"] = prompt
        if options is not None:
            body["options"] = options
        if correct_answer is not None:
            body["correct_answer"] = correct_answer
        if score is not None:
            body["score"] = score
        if question_type is not None:
            body["question_type"] = question_type
        if not body:
            return _error("No fields to update")
        return await django_api("PATCH", f"{base}/{question_id}/", ctx, json_body=body)

    if action == "delete":
        if not question_id:
            return _error("question_id is required")
        return await django_api("DELETE", f"{base}/{question_id}/", ctx)

    if action == "reorder":
        if not question_ids:
            return _error("question_ids is required")
        orders = [{"id": qid, "order": idx} for idx, qid in enumerate(question_ids)]
        return await django_api("POST", f"{base}/reorder/", ctx, json_body={"orders": orders})

    if action == "import_from_bank":
        if not items:
            return _error("items is required (list of {question_bank_id, question_id})")
        return await django_api("POST", f"{base}/import-from-bank/", ctx, json_body={"items": items})

    return _error(f"Unknown action: {action}")


# ---------------------------------------------------------------------------
# Tool 3: qjudge_grading — 作答查看 + 批改
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_grading(
    action: str,
    contest_id: str,
    ctx: Context,
    question_id: str | None = None,
    participant_id: str | None = None,
    exam_answer_id: str | None = None,
    score: float | None = None,
    feedback: str | None = None,
    grades: list[dict] | None = None,
    include_participants: bool = False,
    include_omitted: bool = False,
    include_full_titles: bool = False,
) -> Any:
    """Grade exam answers. Actions: list_answers, question_detail, dashboard, grade, batch_grade, ungrade."""
    base = f"/api/v1/contests/{contest_id}/exam-answers"

    if action == "list_answers":
        query: dict[str, str] = {}
        if participant_id:
            query["participant_id"] = participant_id
        if question_id:
            query["question_id"] = question_id
        suffix = f"?{urlencode(query)}" if query else ""
        raw = await django_api("GET", f"{base}/all-answers/{suffix}", ctx)
        return _compact_answers(raw)

    if action == "question_detail":
        if not question_id:
            return _error("question_id is required")
        raw = await django_api("GET", f"{base}/question-detail/?question_id={question_id}", ctx)
        return _compact_question_detail(
            raw,
            include_participants=include_participants,
            include_omitted=include_omitted,
        )

    if action == "dashboard":
        raw = await django_api("GET", f"{base}/dashboard-summary/", ctx)
        return _compact_dashboard(raw, include_full_titles=include_full_titles)

    if action == "grade":
        if not exam_answer_id:
            return _error("exam_answer_id is required")
        if score is None:
            return _error("score is required")
        body: dict[str, Any] = {"score": score}
        if feedback is not None:
            body["feedback"] = feedback
        result = await django_api("POST", f"{base}/{exam_answer_id}/grade/", ctx, json_body=body)
        if isinstance(result, dict) and result.get("error"):
            return result
        return {"status": "success", "exam_answer_id": exam_answer_id, "score": score}

    if action == "batch_grade":
        if not grades:
            return _error("grades array is required")
        result = await django_api("POST", f"{base}/batch-grade/", ctx, json_body={"grades": grades})
        if isinstance(result, dict) and result.get("error"):
            return result
        if not isinstance(result, dict):
            return {"status": "success"}
        results = result.get("results", [])
        if not isinstance(results, list):
            results = []
        return {
            "status": "success",
            "graded_count": result.get("graded_count", 0),
            "error_count": sum(1 for item in results if item.get("status") != "ok"),
        }

    if action == "ungrade":
        if not exam_answer_id:
            return _error("exam_answer_id is required")
        result = await django_api("POST", f"{base}/{exam_answer_id}/ungrade/", ctx)
        if isinstance(result, dict) and result.get("error"):
            return result
        return {"status": "success", "exam_answer_id": exam_answer_id}

    return _error(f"Unknown action: {action}")


# ---------------------------------------------------------------------------
# Tool 4: qjudge_coding — 競賽程式題目管理 + test_run
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_coding(
    action: str,
    ctx: Context,
    contest_id: str | None = None,
    problem_id: str | None = None,
    title: str | None = None,
    items: list[dict] | None = None,
    max_score: int | None = None,
    language: str | None = None,
    code: str | None = None,
    use_samples: bool = True,
    custom_test_cases: list[dict] | None = None,
) -> Any:
    """Manage coding problems within a contest.

    Actions:
      list         — List coding problems in a contest (required: contest_id)
      get          — Get problem detail (required: contest_id, problem_id)
      create       — Create a new problem in contest (required: contest_id, title)
      import_from_bank — Import from question bank (required: contest_id, items [{question_bank_id, question_id}])
      update_score — Update contest-level score (required: contest_id, problem_id, max_score)
      delete       — Remove problem from contest (required: contest_id, problem_id)
      test_run     — Execute code against test cases (required: problem_id, language, code)
    """
    if action == "list":
        if not contest_id:
            return _error("contest_id is required")
        return await django_api("GET", f"/api/v1/contests/{contest_id}/problems/", ctx)

    if action == "get":
        if not contest_id:
            return _error("contest_id is required")
        if not problem_id:
            return _error("problem_id is required")
        return await django_api("GET", f"/api/v1/contests/{contest_id}/problems/{problem_id}/", ctx)

    if action == "create":
        if not contest_id:
            return _error("contest_id is required")
        if not title:
            return _error("title is required")
        body: dict[str, Any] = {"title": title}
        if max_score is not None:
            body["max_score"] = max_score
        return await django_api("POST", f"/api/v1/contests/{contest_id}/problems/", ctx, json_body=body)

    if action == "import_from_bank":
        if not contest_id:
            return _error("contest_id is required")
        if not items:
            return _error("items is required (list of {question_bank_id, question_id})")
        return await django_api(
            "POST", f"/api/v1/contests/{contest_id}/problems/import-from-bank/",
            ctx, json_body={"items": items},
        )

    if action == "update_score":
        if not contest_id:
            return _error("contest_id is required")
        if not problem_id:
            return _error("problem_id is required")
        if max_score is None:
            return _error("max_score is required")
        return await django_api(
            "PATCH",
            f"/api/v1/contests/{contest_id}/problems/{problem_id}/score/",
            ctx,
            json_body={"max_score": max_score},
        )

    if action == "delete":
        if not contest_id:
            return _error("contest_id is required")
        if not problem_id:
            return _error("problem_id is required")
        return await django_api("DELETE", f"/api/v1/contests/{contest_id}/problems/{problem_id}/", ctx)

    if action == "test_run":
        if not problem_id:
            return _error("problem_id is required")
        if not language:
            return _error("language is required")
        if not code:
            return _error("code is required")
        body = {
            "language": language,
            "code": code,
            "use_samples": use_samples,
        }
        if custom_test_cases is not None:
            body["custom_test_cases"] = custom_test_cases
        return await django_api("POST", f"/api/v1/problems/{problem_id}/test_run/", ctx, json_body=body)

    return _error(f"Unknown action: {action}")


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
