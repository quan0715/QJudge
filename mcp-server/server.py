"""QJudge MCP Server tools."""

import json
from typing import Any
from urllib.parse import urlencode

import httpx
from mcp.server.fastmcp import FastMCP, Context

from starlette.responses import JSONResponse

from config import DJANGO_BASE_URL, MCP_HOST, MCP_PORT, MCP_PUBLIC_URL, OAUTH_ISSUER_URL


async def django_api(
    method: str,
    path: str,
    ctx: Context,
    *,
    json_body: dict | None = None,
) -> Any:
    """Call Django API with OAuth token passthrough."""
    headers: dict[str, str] = {}
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
)


@mcp.custom_route("/.well-known/oauth-protected-resource", methods=["GET"])
async def protected_resource_metadata(request):
    """RFC 9728 — OAuth 2.0 Protected Resource Metadata."""
    return JSONResponse(
        {
            "resource": MCP_PUBLIC_URL,
            "authorization_servers": [OAUTH_ISSUER_URL],
        }
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
) -> Any:
    """Discover classrooms and contests. Actions: list_classrooms, list_contests, get_contest."""
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
) -> Any:
    """Manage exam questions. Actions: list, get, create, update, delete, reorder."""
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
# Tool 4: qjudge_coding — 程式題目 CRUD + test_run
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_coding(
    action: str,
    ctx: Context,
    problem_id: str | None = None,
    search: str | None = None,
    difficulty: str | None = None,
    tags: str | None = None,
    title: str | None = None,
    slug: str | None = None,
    time_limit: int | None = None,
    memory_limit: int | None = None,
    forbidden_keywords: list[str] | None = None,
    required_keywords: list[str] | None = None,
    test_cases: list[dict] | None = None,
    language_configs: list[dict] | None = None,
    translations: list[dict] | None = None,
    existing_tag_ids: list[str] | None = None,
    new_tag_names: list[str] | None = None,
    language: str | None = None,
    code: str | None = None,
    use_samples: bool = True,
    custom_test_cases: list[dict] | None = None,
) -> Any:
    """Manage coding problems: list, view, create, edit, delete, and test-run code.

    Actions:
      list        — Browse problems (optional: search, difficulty, tags)
      get         — Get full problem detail including test cases and language configs
      create      — Create a new problem (required: title)
      update      — Update problem fields (required: problem_id + at least one field)
      delete      — Delete a problem (required: problem_id)
      test_run    — Execute code against test cases (required: problem_id, language, code)
    """
    base = "/api/v1/problems"

    if action == "list":
        query: dict[str, str] = {"scope": "manage"}
        if search:
            query["search"] = search
        if difficulty:
            query["difficulty"] = difficulty
        if tags:
            query["tags"] = tags
        return await django_api("GET", f"{base}/?{urlencode(query)}", ctx)

    if action == "get":
        if not problem_id:
            return _error("problem_id is required")
        return await django_api("GET", f"{base}/{problem_id}/", ctx)

    if action == "create":
        if not title:
            return _error("title is required")
        body: dict[str, Any] = {"title": title}
        for key, val in [
            ("difficulty", difficulty),
            ("slug", slug),
            ("time_limit", time_limit),
            ("memory_limit", memory_limit),
            ("forbidden_keywords", forbidden_keywords),
            ("required_keywords", required_keywords),
            ("test_cases", test_cases),
            ("language_configs", language_configs),
            ("translations", translations),
            ("existing_tag_ids", existing_tag_ids),
            ("new_tag_names", new_tag_names),
        ]:
            if val is not None:
                body[key] = val
        return await django_api("POST", f"{base}/", ctx, json_body=body)

    if action == "update":
        if not problem_id:
            return _error("problem_id is required")
        body = {}
        for key, val in [
            ("title", title),
            ("difficulty", difficulty),
            ("slug", slug),
            ("time_limit", time_limit),
            ("memory_limit", memory_limit),
            ("forbidden_keywords", forbidden_keywords),
            ("required_keywords", required_keywords),
            ("test_cases", test_cases),
            ("language_configs", language_configs),
            ("translations", translations),
            ("existing_tag_ids", existing_tag_ids),
            ("new_tag_names", new_tag_names),
        ]:
            if val is not None:
                body[key] = val
        if not body:
            return _error("No fields to update")
        return await django_api("PATCH", f"{base}/{problem_id}/", ctx, json_body=body)

    if action == "delete":
        if not problem_id:
            return _error("problem_id is required")
        await django_api("DELETE", f"{base}/{problem_id}/", ctx)
        return {"status": "deleted", "problem_id": problem_id}

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
        return await django_api("POST", f"{base}/{problem_id}/test_run/", ctx, json_body=body)

    return _error(f"Unknown action: {action}")


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
