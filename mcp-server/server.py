"""QJudge MCP Server tools."""

import json
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import httpx
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP, Context

from config import (
    DJANGO_BASE_URL,
    DJANGO_FORWARDED_PROTO,
    MCP_HOST,
    MCP_PORT,
    MCP_PUBLIC_URL,
    OAUTH_ISSUER_URL,
)


class DjangoTokenVerifier(TokenVerifier):
    """Verify OAuth tokens by forwarding to Django backend."""

    async def verify_token(self, token: str) -> AccessToken | None:
        """Check token against Django. Return AccessToken if valid, None if not."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{DJANGO_BASE_URL}/api/v1/auth/me",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Forwarded-Proto": DJANGO_FORWARDED_PROTO,
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


def _format_django_errors(detail: Any) -> dict[str, Any]:
    """Convert Django error response into AI-friendly errors list.

    Handles two formats:
    - DRF custom_exception_handler: {success: false, error: {code, message, details: {field: [...]}}}
    - Plain DRF ValidationError: {field: ["msg1", "msg2"]}
    """
    if not isinstance(detail, dict):
        return {"error": True, "detail": detail}

    # Handle custom_exception_handler wrapper: {success: false, error: {...}}
    inner_error = detail.get("error")
    if isinstance(inner_error, dict) and "message" in inner_error:
        errors = []
        message = inner_error.get("message", "")
        details = inner_error.get("details")
        if isinstance(details, dict):
            for field, messages in details.items():
                if isinstance(messages, list):
                    for msg in messages:
                        errors.append(f"{field}: {msg}")
                elif isinstance(messages, str):
                    errors.append(f"{field}: {messages}")
        if errors:
            return {"error": True, "errors": errors}
        if message:
            return {"error": True, "errors": [message]}

    # Handle plain DRF ValidationError: {field: ["msg"]}
    errors = []
    for field, messages in detail.items():
        if isinstance(messages, list):
            for msg in messages:
                errors.append(f"{field}: {msg}")
        elif isinstance(messages, str):
            errors.append(f"{field}: {messages}")
    if errors:
        return {"error": True, "errors": errors}

    return {"error": True, "detail": detail}


async def django_api(
    method: str,
    path: str,
    ctx: Context,
    *,
    json_body: dict | None = None,
    timeout: float = 30.0,
) -> Any:
    """Call Django API with OAuth token passthrough.

    Never raises httpx errors — returns ``_error(...)`` so MCP does not wrap a bare
    exception with an empty ``str(e)`` (FastMCP: "Error executing tool ...: ").
    """
    headers: dict[str, str] = {"X-Forwarded-Proto": DJANGO_FORWARDED_PROTO}
    transport_request = getattr(ctx.request_context, "request", None)
    if transport_request and hasattr(transport_request, "headers"):
        auth_header = transport_request.headers.get("authorization", "")
        if auth_header:
            headers["Authorization"] = auth_header

    url = f"{DJANGO_BASE_URL}{path}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                json=json_body,
            )
    except httpx.TimeoutException as e:
        return _error(f"Django HTTP timeout after {timeout}s: {e!r}", status=504)
    except httpx.RequestError as e:
        return _error(f"Django HTTP request failed: {e!r}", status=502)

    if response.status_code == 204:
        return {"status": "success"}

    try:
        body = response.json()
    except Exception:
        body = {"raw": response.text}

    if response.status_code >= 400:
        result = _format_django_errors(body)
        result["status"] = response.status_code
        return result

    return body



def _error(detail: str, *, status: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"error": True, "detail": detail}
    if status is not None:
        payload["status"] = status
    return payload


def _help_hint(tool_name: str | None = None) -> str:
    if tool_name:
        return (
            f'For usage, call qjudge_browse(action="get_help", tool_name="{tool_name}").'
        )
    return 'For usage, call qjudge_browse(action="get_help").'


def _tool_error(
    *,
    tool_name: str,
    detail: str,
    status: int | None = None,
) -> dict[str, Any]:
    return _error(f"{detail} {_help_hint(tool_name)}", status=status)


def _is_uuid(value: str | None) -> bool:
    if not value or not isinstance(value, str):
        return False
    try:
        UUID(value)
        return True
    except (TypeError, ValueError):
        return False


def _require_uuid(
    value: str | None,
    *,
    field_name: str,
    tool_name: str,
    hint: str | None = None,
) -> dict[str, Any] | None:
    if not value:
        return _tool_error(tool_name=tool_name, detail=f"{field_name} is required")
    if _is_uuid(value):
        return None
    msg = f'{field_name} must be a UUID string, got "{value}".'
    if hint:
        msg = f"{msg} {hint}"
    return _tool_error(tool_name=tool_name, detail=msg, status=400)


def _extract_results(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            return [row for row in results if isinstance(row, dict)]
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    return []


def _text_match(value: Any, keyword: str) -> bool:
    if not isinstance(value, str):
        return False
    return keyword.casefold() in value.casefold()


def _matches_keyword(row: dict[str, Any], keyword: str, fields: tuple[str, ...]) -> bool:
    return any(_text_match(row.get(field), keyword) for field in fields)


def _compact_classroom(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "classroom_id": row.get("uuid"),
        "name": row.get("name"),
        "description": row.get("description"),
        "current_user_role": row.get("current_user_role"),
    }


def _compact_contest_from_detail(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "contest_id": row.get("id"),
        "name": row.get("name"),
        "description": row.get("description"),
        "status": row.get("status"),
        "contest_type": row.get("contest_type"),
        "delivery_mode": row.get("delivery_mode"),
        "bound_classroom_id": row.get("bound_classroom_id"),
    }


def _compact_contest_from_classroom(row: dict[str, Any], *, classroom_id: str) -> dict[str, Any]:
    return {
        "contest_id": row.get("contest_id"),
        "name": row.get("contest_name"),
        "description": row.get("contest_description"),
        "status": row.get("contest_status"),
        "contest_type": row.get("contest_type"),
        "delivery_mode": row.get("delivery_mode"),
        "bound_classroom_id": classroom_id,
    }


_CODE_RUNNER_LANGUAGE_ALIASES: dict[str, str] = {
    "cpp": "cpp",
    "c++": "cpp",
    "python": "python",
    "python3": "python",
    "py": "python",
    "c": "c",
    "java": "java",
}


def _normalize_code_runner_language(language: str) -> str | None:
    key = language.strip().lower()
    if not key:
        return None
    return _CODE_RUNNER_LANGUAGE_ALIASES.get(key)


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


async def _ensure_contest_type(
    *,
    contest_id: str,
    ctx: Context,
    expected_type: str,
    tool_name: str,
    allowed_label: str,
    disallowed_tool_name: str,
) -> dict[str, Any] | None:
    contest = await django_api("GET", f"/api/v1/contests/{contest_id}/", ctx)
    if isinstance(contest, dict) and contest.get("error"):
        return contest
    if not isinstance(contest, dict):
        return _error("Unable to determine contest type", status=500)

    actual_type = contest.get("contest_type")
    if actual_type == expected_type:
        return None

    actual_label = "coding" if actual_type == "coding" else "paper_exam"
    return _error(
        f"{tool_name} only supports {allowed_label} contests. "
        f"This contest is {actual_label}. Use {disallowed_tool_name} instead.",
        status=400,
    )


def _normalize_newlines(value: str) -> str:
    """Convert literal backslash-n sequences to real newlines.

    AI models often send ``\\n`` as two-char escape sequences instead of actual
    line breaks.  This helper normalises them so that stored content renders
    correctly in the UI.
    """
    return value.replace("\\n", "\n")


def _normalize_text_fields(body: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    """In-place normalise newline escapes for the given string-valued *keys*."""
    for k in keys:
        v = body.get(k)
        if isinstance(v, str):
            body[k] = _normalize_newlines(v)
    return body


def _normalize_test_cases(test_cases: list[dict]) -> list[dict]:
    """Normalise newline escapes inside test-case input/output data."""
    for tc in test_cases:
        for field in ("input_data", "output_data"):
            if isinstance(tc.get(field), str):
                tc[field] = _normalize_newlines(tc[field])
    return test_cases


def _normalize_translations(translations: list[dict]) -> list[dict]:
    """Normalise newline escapes inside translation text fields."""
    text_fields = ("title", "description", "input_description", "output_description", "hint")
    for tr in translations:
        for field in text_fields:
            if isinstance(tr.get(field), str):
                tr[field] = _normalize_newlines(tr[field])
    return translations


def _normalize_body_text(body: dict[str, Any]) -> dict[str, Any]:
    """Normalise escaped newlines across all text-bearing fields in a request body.

    Handles top-level ``prompt``, nested ``coding_ext.translations`` /
    ``coding_ext.test_cases``, and top-level ``translations`` / ``test_cases``.
    """
    _normalize_text_fields(body, ("prompt",))
    # Top-level (qjudge_coding_problems create)
    if isinstance(body.get("translations"), list):
        _normalize_translations(body["translations"])
    if isinstance(body.get("test_cases"), list):
        _normalize_test_cases(body["test_cases"])
    # Nested in coding_ext (bank API payloads; qjudge_bank MCP tool is currently disabled)
    ext = body.get("coding_ext")
    if isinstance(ext, dict):
        if isinstance(ext.get("translations"), list):
            _normalize_translations(ext["translations"])
        if isinstance(ext.get("test_cases"), list):
            _normalize_test_cases(ext["test_cases"])
    return body


def _build_exam_question_body(
    *,
    question_type: str | None = None,
    prompt: str | None = None,
    explanation: str | None = None,
    score: int | None = None,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if question_type is not None:
        body["question_type"] = question_type
    if prompt is not None:
        body["prompt"] = _normalize_newlines(prompt)
    if explanation is not None:
        body["explanation"] = _normalize_newlines(explanation)
    if score is not None:
        body["score"] = score
    if options is not None:
        body["options"] = options
    if correct_answer is not None:
        body["correct_answer"] = correct_answer
    return body


_TOOL_HELP = {
    "tools": {
        "qjudge_browse": "Discovery only: list/get classrooms, list classroom contests, list/get contests, get_help",
        "qjudge_contest_manager": "Contest operations: get_detail, list_problems, reorder (requires contest_id UUID)",
        "qjudge_exam": "Paper-exam contest questions: get, create, update, delete, batch_create, import_from_bank (no list/reorder — use qjudge_contest_manager)",
        "qjudge_coding_problems": "Coding contest problems: get, create, update, delete (no list — use qjudge_contest_manager list_problems)",
        "qjudge_code_runner": "Execute code against test cases: run code, get results",
        "qjudge_grading": "Grading: list_answers, question_detail, dashboard, grade, batch_grade, ungrade",
    },
    "routing_rules": {
        "unknown_id": "If classroom_id/contest_id is unknown, use qjudge_browse first.",
        "contest_ops": "Once contest_id is known, use qjudge_contest_manager for get_detail/list_problems/reorder.",
        "single_item_crud": "Use qjudge_exam (paper_exam) or qjudge_coding_problems (coding) for single-item CRUD.",
        "code_execution": "Use qjudge_code_runner for running source code.",
    },
    "coding_tools_how_to_choose": {
        "summary": (
            "Several tools touch contests and code — pick by intent. "
            "qjudge_browse = classroom/contest discovery (find IDs); "
            "qjudge_contest_manager = get_detail + list_problems + reorder (needs contest_id); "
            "qjudge_exam = paper_exam question CRUD; "
            "qjudge_coding_problems = coding problem CRUD; "
            "qjudge_code_runner = execute code. "
            "Wrong tool = wrong API or 400 errors."
        ),
        "qjudge_coding_problems": {
            "use_when": "You need to CREATE/EDIT/DELETE **coding problems inside a coding contest** (single-item CRUD).",
            "requires": "contest_id (UUID) of a contest where contest_type is **coding**. problem_id = that contest's coding problem UUID.",
            "never": "Do NOT run user's source code here. No 'code' parameter. To **list all** problems in the contest, use **qjudge_contest_manager** ``list_problems`` — this tool has no ``list`` action.",
        },
        "qjudge_code_runner": {
            "use_when": "You need to **execute source code** against the problem's **stored** test cases (teacher/test-run).",
            "requires": "problem_id = **CodingProblem / Problem UUID** (same id as GET /api/v1/management/problems/{id}/). language + code strings.",
            "behavior": "Runs **all** test cases on the server in order; no sample-only or custom-case flags.",
            "never": "Do NOT use contest_id here. Do NOT create/update problems here.",
        },
        # qjudge_bank MCP tool disabled — restore entry here when re-enabled.
        "id_confusion": (
            "contest_id identifies a contest. problem_id in qjudge_coding_problems identifies a **problem row bound to that contest**. "
            "qjudge_code_runner.problem_id is the **global problem UUID** (management problem id), "
            "obtainable from qjudge_contest_manager list_problems or qjudge_coding_problems get response — use the `id` field of the coding problem object."
        ),
    },
    "coding_problem_example": {
        "_tool": "qjudge_coding_problems",
        "_action": "create",
        "_note": "description/input_description/output_description/hint are TOP-LEVEL params",
        "contest_id": "<uuid>",
        "title": "A+B Problem",
        "difficulty": "easy",
        "time_limit": 1000,
        "memory_limit": 128,
        "description": "Markdown 題目敘述",
        "input_description": "輸入格式",
        "output_description": "輸出格式",
        "hint": "",
        "test_cases": [
            {"input_data": "1 2\n", "output_data": "3\n", "is_sample": True, "weight_percent": 0, "order": 0},
            {"input_data": "100 200\n", "output_data": "300\n", "is_sample": False, "weight_percent": 50, "order": 1},
            {"input_data": "-1 1\n", "output_data": "0\n", "is_sample": False, "weight_percent": 50, "order": 2},
        ],
        "language_configs": [
            {"language": "cpp", "template_code": "", "is_enabled": True, "order": 0},
            {"language": "python", "template_code": "", "is_enabled": True, "order": 1},
        ],
    },
    "exam_question_example": {
        "_tool": "qjudge_exam",
        "_action": "create",
        "question_type": "single_choice",
        "prompt": "台灣的首都是哪裡？",
        "options": ["台北", "台中", "高雄", "台南"],
        "correct_answer": 0,
        "explanation": "台北是台灣的首都。",
        "score": 10,
        "_options_note": "Do NOT add A/B/C/D prefixes — the UI adds them automatically",
        "_correct_answer_formats": {
            "single_choice": "0-based int index (e.g. 0)",
            "multiple_choice": "list of int indices (e.g. [0, 2])",
            "true_false": "boolean (true/false), options should be ['True', 'False']",
            "short_answer": "string",
        },
    },
    "common_mistakes": {
        "coding_ext wrapper": (
            "MCP does not accept coding_ext or translations[] — pass description, input_description, test_cases, etc. as top-level params in qjudge_coding_problems"
        ),
        "prompt for coding": "Do NOT use prompt for coding problems — use description instead",
        "score vs weight_percent": "Use weight_percent (not score) in test_cases — total must equal 100",
        "option prefixes": "Do NOT add A/B/C/D prefixes to options — the UI adds them",
        "question_ids for delete": "delete only accepts single question_id — no batch delete",
        "items for create": "create is single-item — use batch_create for multiple items",
        "browse routing": "Use qjudge_browse only for locating classroom_id/contest_id when user intent is ambiguous.",
        "run code on qjudge_coding_problems": "NEVER — use qjudge_code_runner(problem_id, language, code) for execution",
        "list problems in contest": "Use qjudge_contest_manager list_problems. Do NOT use list actions on qjudge_exam / qjudge_coding_problems",
        "reorder contest questions": "Use qjudge_contest_manager reorder — qjudge_browse does not reorder",
        "test_run params removed": "qjudge_code_runner only sends language+code; all stored cases run automatically",
        "javascript in test_run": "Backend judge supports cpp, c, python, java — not javascript for test_run",
        "exam fields on coding": "Do NOT pass paper-exam fields (options, correct_answer, prompt) to qjudge_coding_problems — use description/test_cases; use qjudge_exam for paper_exam contests",
    },
}


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

import os

CLASSROOM_LIST_TEMPLATE_URI = "ui://widget/classroom-list.html"

@mcp.resource(CLASSROOM_LIST_TEMPLATE_URI)
def serve_classroom_list_widget() -> str:
    widget_js_path = os.path.join(
        os.path.dirname(__file__), 
        "../frontend/dist/mcp-widgets/mcp-classroom-list.js"
    )
    
    try:
        with open(widget_js_path, "r", encoding="utf-8") as f:
            js_code = f.read()
    except FileNotFoundError:
        js_code = "document.body.innerHTML = '<h1>UI bundle not found. Please run npm run build in frontend.</h1>';"
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
        <div id="root"></div>
        <script type="module">{{js_code}}</script>
      </body>
    </html>
    """
    
    return html_content

@mcp.tool()
def render_classroom_list(classrooms: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Render a visually appealing classroom list UI.
    MUST be called AFTER calling `qjudge_browse` (action="list_classrooms") to fetch the classrooms data.
    """
    return {
        "content": [{"type": "text", "text": "正在為您顯示教室列表面板..."}],
        "structuredContent": {
            "classrooms": classrooms
        },
        "_meta": {
            "ui": { "resourceUri": CLASSROOM_LIST_TEMPLATE_URI },
            "openai/outputTemplate": CLASSROOM_LIST_TEMPLATE_URI
        }
    }


# ---------------------------------------------------------------------------
# Tool 1: qjudge_browse — 唯讀查詢教室、競賽、題庫
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_browse(
    action: str,
    ctx: Context,
    search: str | None = None,
    status: str | None = None,
    contest_id: str | None = None,
    classroom_id: str | None = None,
    tool_name: str | None = None,
) -> Any:
    """Discovery-only tool for classroom/contest lookup.

    Actions:
      list_classrooms        — List classrooms you manage (optional: search)
      get_classroom          — Get one classroom detail (required: classroom_id)
      list_classroom_contests — List exam contests in one classroom (required: classroom_id, optional: search, status)
      list_contests          — List contests you manage (optional: search, status)
      get_contest            — Get contest detail (required: contest_id)
      get_help               — Return JSON help including `coding_tools_how_to_choose` (when to use
                               qjudge_browse, qjudge_contest_manager, qjudge_coding_problems vs qjudge_code_runner)
    """
    if action == "get_help":
        if tool_name:
            summary = _TOOL_HELP.get("tools", {}).get(tool_name)
            if not summary:
                return _tool_error(
                    tool_name="qjudge_browse",
                    detail=f"Unknown tool_name: {tool_name}",
                    status=400,
                )
            return {
                "tool": tool_name,
                "summary": summary,
                "routing_rules": _TOOL_HELP.get("routing_rules", {}),
                "common_mistakes": _TOOL_HELP.get("common_mistakes", {}),
            }
        return _TOOL_HELP

    if action == "list_classrooms":
        query = {"scope": "manage"}
        if search:
            query["search"] = search
        classrooms_res = await django_api("GET", f"/api/v1/classrooms/?{urlencode(query)}", ctx)
        if isinstance(classrooms_res, dict) and classrooms_res.get("error"):
            return classrooms_res

        classrooms = _extract_results(classrooms_res)
        if search and not classrooms:
            all_classrooms_res = await django_api("GET", "/api/v1/classrooms/?scope=manage", ctx)
            if isinstance(all_classrooms_res, dict) and all_classrooms_res.get("error"):
                return all_classrooms_res
            classrooms = [
                row for row in _extract_results(all_classrooms_res)
                if _matches_keyword(row, search, ("name", "description"))
            ]
        return [_compact_classroom(row) for row in classrooms]

    if action == "get_classroom":
        uuid_error = _require_uuid(
            classroom_id,
            field_name="classroom_id",
            tool_name="qjudge_browse",
            hint="Use qjudge_browse list_classrooms first to get classroom_id.",
        )
        if uuid_error:
            return uuid_error
        classroom = await django_api("GET", f"/api/v1/classrooms/{classroom_id}/", ctx)
        if isinstance(classroom, dict) and classroom.get("error"):
            return classroom
        if not isinstance(classroom, dict):
            return _tool_error(tool_name="qjudge_browse", detail="Invalid classroom payload", status=500)
        return _compact_classroom(classroom)

    if action == "list_classroom_contests":
        uuid_error = _require_uuid(
            classroom_id,
            field_name="classroom_id",
            tool_name="qjudge_browse",
            hint="Use qjudge_browse list_classrooms first to get classroom_id.",
        )
        if uuid_error:
            return uuid_error
        contests_res = await django_api("GET", f"/api/v1/classrooms/{classroom_id}/contests/", ctx)
        if isinstance(contests_res, dict) and contests_res.get("error"):
            return contests_res
        contests = _extract_results(contests_res)
        if status:
            contests = [row for row in contests if row.get("contest_status") == status]
        if search:
            contests = [
                row for row in contests
                if _matches_keyword(row, search, ("contest_name", "contest_description"))
            ]
        return [_compact_contest_from_classroom(row, classroom_id=classroom_id) for row in contests]

    if action == "list_contests":
        query: dict[str, str] = {"scope": "manage"}
        if search:
            query["search"] = search
        if status:
            query["status"] = status
        contests_res = await django_api("GET", f"/api/v1/contests/?{urlencode(query)}", ctx)
        if isinstance(contests_res, dict) and contests_res.get("error"):
            return contests_res
        contests = _extract_results(contests_res)

        # If backend name-only search misses, fallback to classroom contests and match name/description.
        if search and not contests:
            classrooms_res = await django_api("GET", "/api/v1/classrooms/?scope=manage", ctx)
            if isinstance(classrooms_res, dict) and classrooms_res.get("error"):
                return classrooms_res
            merged: dict[str, dict[str, Any]] = {}
            for room in _extract_results(classrooms_res):
                cid = room.get("uuid")
                if not isinstance(cid, str) or not _is_uuid(cid):
                    continue
                room_contests = await django_api("GET", f"/api/v1/classrooms/{cid}/contests/", ctx)
                if isinstance(room_contests, dict) and room_contests.get("error"):
                    continue
                for row in _extract_results(room_contests):
                    compact = _compact_contest_from_classroom(row, classroom_id=cid)
                    contest_uuid = compact.get("contest_id")
                    if not isinstance(contest_uuid, str):
                        continue
                    if status and compact.get("status") != status:
                        continue
                    if not _matches_keyword(
                        {
                            "name": compact.get("name"),
                            "description": compact.get("description"),
                        },
                        search,
                        ("name", "description"),
                    ):
                        continue
                    merged[contest_uuid] = compact
            return list(merged.values())

        import asyncio
        detail_calls = [
            django_api("GET", f"/api/v1/contests/{row.get('id')}/", ctx)
            for row in contests
            if isinstance(row.get("id"), str)
        ]
        details = await asyncio.gather(*detail_calls) if detail_calls else []
        compact = [
            _compact_contest_from_detail(detail)
            for detail in details
            if isinstance(detail, dict) and not detail.get("error")
        ]
        if search:
            compact = [row for row in compact if _matches_keyword(row, search, ("name", "description"))]
        return compact

    if action == "get_contest":
        uuid_error = _require_uuid(
            contest_id,
            field_name="contest_id",
            tool_name="qjudge_browse",
            hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
        )
        if uuid_error:
            return uuid_error
        contest = await django_api("GET", f"/api/v1/contests/{contest_id}/", ctx)
        if isinstance(contest, dict) and contest.get("error"):
            return contest
        if not isinstance(contest, dict):
            return _tool_error(tool_name="qjudge_browse", detail="Invalid contest payload", status=500)
        return _compact_contest_from_detail(contest)

    if action in {"get_detail", "list_problems", "reorder"}:
        return _tool_error(
            tool_name="qjudge_browse",
            detail=(
                f"Action '{action}' is not available on qjudge_browse. "
                "Use qjudge_contest_manager with contest_id instead."
            ),
            status=400,
        )

    return _tool_error(tool_name="qjudge_browse", detail=f"Unknown action: {action}", status=400)


# ---------------------------------------------------------------------------
# Tool 1b: qjudge_contest_manager — contest operations (requires contest_id UUID)
# ---------------------------------------------------------------------------
@mcp.tool()
async def qjudge_contest_manager(
    action: str,
    ctx: Context,
    contest_id: str | None = None,
    question_ids: list[str] | None = None,
) -> Any:
    """Contest-scoped operations with explicit contest_id.

    Actions:
      get_detail    — Get contest detail (required: contest_id UUID)
      list_problems — List all contest problems/questions (required: contest_id UUID)
      reorder       — Reorder questions/problems (required: contest_id UUID, question_ids)
    """
    valid_actions = {"get_detail", "list_problems", "reorder"}
    if action not in valid_actions:
        return _tool_error(
            tool_name="qjudge_contest_manager",
            detail=(
                f"Unknown action: {action!r}. "
                f"qjudge_contest_manager supports: {sorted(valid_actions)}."
            ),
            status=400,
        )
    uuid_error = _require_uuid(
        contest_id,
        field_name="contest_id",
        tool_name="qjudge_contest_manager",
        hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
    )
    if uuid_error:
        return uuid_error
    if action == "reorder" and not question_ids:
        return _tool_error(
            tool_name="qjudge_contest_manager",
            detail="question_ids is required (ordered list of all question/problem IDs)",
        )

    if action == "get_detail":
        return await django_api("GET", f"/api/v1/contests/{contest_id}/", ctx)

    contest = await django_api("GET", f"/api/v1/contests/{contest_id}/", ctx)
    if isinstance(contest, dict) and contest.get("error"):
        return contest

    contest_type = contest.get("contest_type") if isinstance(contest, dict) else None
    if contest_type not in {"coding", "paper_exam"}:
        return _tool_error(
            tool_name="qjudge_contest_manager",
            detail=(
                "list_problems and reorder only support contests with contest_type "
                "'coding' or 'paper_exam'."
            ),
            status=400,
        )

    if action == "list_problems":
        if contest_type == "coding":
            return await django_api("GET", f"/api/v1/contests/{contest_id}/problems/", ctx)
        return await django_api("GET", f"/api/v1/contests/{contest_id}/exam-questions/", ctx)

    orders = [{"id": qid, "order": idx} for idx, qid in enumerate(question_ids or [])]
    if contest_type == "coding":
        return await django_api(
            "POST",
            f"/api/v1/contests/{contest_id}/problems/reorder/",
            ctx,
            json_body={"orders": orders},
        )
    return await django_api(
        "POST",
        f"/api/v1/contests/{contest_id}/exam-questions/reorder/",
        ctx,
        json_body={"orders": orders},
    )


# ===========================================================================
# qjudge_bank — 已自 MCP 停用（未註冊工具）。有需求時取消以下整段註解並還原 @mcp.tool()。
# ===========================================================================
# ---------------------------------------------------------------------------
# Tool 2: qjudge_bank — 題庫題目 CRUD（停用中，僅保留實作供還原）
# ---------------------------------------------------------------------------
#
# @mcp.tool()
# async def qjudge_bank(
#     action: str,
#     ctx: Context,
#     bank_id: str | None = None,
#     question_id: str | None = None,
#     question_type: str | None = None,
#     title: str | None = None,
#     prompt: str | None = None,
#     difficulty: str | None = None,
#     score: int | None = None,
#     time_limit: int | None = None,
#     memory_limit: int | None = None,
#     options: list[str] | None = None,
#     correct_answer: Any | None = None,
#     description: str | None = None,
#     input_description: str | None = None,
#     output_description: str | None = None,
#     hint: str | None = None,
#     test_cases: list[dict] | None = None,
#     language_configs: list[dict] | None = None,
# ) -> Any:
#     """CRUD operations for question **bank** items (reusable assets), not live contest problems.
#
#     Routing (read this first):
#       • **Contest coding problems** (edit problems inside a contest) → `qjudge_coding_problems`, not qjudge_bank.
#       • **Contest paper/exam questions** → `qjudge_exam`, not qjudge_bank.
#       • **Reusable bank questions** (create templates before importing) → this tool.
#
#     Do NOT use this tool for contest question management — use qjudge_exam or qjudge_coding_problems instead.
#
#     Actions:
#       create — Create a question in a bank (required: bank_id, question_type, title)
#       get    — Get a bank question (required: question_id)
#       update — Update a bank question (required: question_id)
#       delete — Delete a bank question (required: question_id)
#
#     Field format guide (exam questions):
#       question_type  — "exam" for non-coding questions, "coding" for coding problems.
#       options        — Plain text list WITHOUT letter prefixes. The UI adds A/B/C/D automatically.
#                        Good: ["台北", "台中", "高雄"]
#                        Bad:  ["A. 台北", "B. 台中", "C. 高雄"]
#       correct_answer — For single_choice: 0-based integer index (e.g. 0 for the first option).
#                        For multiple_choice: list of 0-based integer indices (e.g. [0, 2]).
#                        For true_false: boolean (true/false). options should be ["True", "False"].
#                        For short_answer/essay: string.
#
#     Field format guide (coding questions):
#       description          — Problem description (Markdown)
#       input_description    — Input format description
#       output_description   — Output format description
#       hint                 — Hint text
#       test_cases           — [{input_data: "...", output_data: "...", is_sample: true/false,
#                               weight_percent: 25, order: 0}]
#       language_configs     — [{language: "python", template_code: "", is_enabled: true, order: 0}]
#     """
#     valid_actions = {"create", "get", "update", "delete"}
#     if action not in valid_actions:
#         return _error(
#             f"Unknown action: {action!r}. "
#             f"qjudge_bank supports: {sorted(valid_actions)}"
#         )
#
#     if action == "create":
#         if not bank_id:
#             return _error("bank_id is required")
#         if not question_type:
#             return _error("question_type is required")
#         if not title:
#             return _error("title is required")
#
#         # Type-based field validation
#         warnings: list[str] = []
#         exam_fields = {k: v for k, v in [("options", options), ("correct_answer", correct_answer)] if v is not None}
#         coding_fields = {k: v for k, v in [("description", description), ("input_description", input_description),
#                          ("output_description", output_description), ("test_cases", test_cases),
#                          ("language_configs", language_configs)] if v is not None}
#
#         if question_type == "coding" and exam_fields:
#             return _error(
#                 f"Coding questions do not use {', '.join(exam_fields.keys())}. "
#                 "Use description, test_cases, language_configs, etc. instead."
#             )
#         if question_type == "exam" and coding_fields:
#             return _error(
#                 f"Exam questions do not use {', '.join(coding_fields.keys())}. "
#                 "Use prompt, options, correct_answer instead."
#             )
#
#         if question_type == "coding":
#             if not description:
#                 warnings.append("missing description — problem will have no description")
#             if not test_cases:
#                 warnings.append("missing test_cases — problem will have no test cases")
#             if not language_configs:
#                 warnings.append("missing language_configs — problem will have no language enabled")
#
#         body: dict[str, Any] = {"question_type": question_type, "title": title}
#         for key, val in [
#             ("prompt", prompt),
#             ("difficulty", difficulty),
#             ("score", score),
#             ("time_limit", time_limit),
#             ("memory_limit", memory_limit),
#             ("options", options),
#             ("correct_answer", correct_answer),
#         ]:
#             if val is not None:
#                 body[key] = val
#
#         # Assemble coding_ext from top-level params for coding questions
#         if question_type == "coding":
#             coding_ext: dict[str, Any] = {}
#             for key, val in [
#                 ("description", description),
#                 ("input_description", input_description),
#                 ("output_description", output_description),
#                 ("hint", hint),
#             ]:
#                 if val is not None:
#                     coding_ext[key] = val
#             if test_cases is not None:
#                 coding_ext["test_cases"] = test_cases
#             if language_configs is not None:
#                 coding_ext["language_configs"] = language_configs
#             if coding_ext:
#                 body["coding_ext"] = coding_ext
#
#         _normalize_body_text(body)
#         result = await django_api("POST", f"/api/v1/question-banks/{bank_id}/questions/", ctx, json_body=body)
#
#         if warnings and isinstance(result, dict) and not result.get("error"):
#             result["warnings"] = warnings
#         return result
#
#     if action == "get":
#         if not question_id:
#             return _error("question_id is required")
#         return await django_api("GET", f"/api/v1/question-bank-items/{question_id}/", ctx)
#
#     if action == "update":
#         if not question_id:
#             return _error("question_id is required")
#
#         # MCP-level validation warnings for coding questions
#         warnings = []
#         if question_type == "coding":
#             if not description:
#                 warnings.append("missing description — problem will have no description")
#             if not test_cases:
#                 warnings.append("missing test_cases — problem will have no test cases")
#             if not language_configs:
#                 warnings.append("missing language_configs — problem will have no language enabled")
#
#         body = {}
#         for key, val in [
#             ("question_type", question_type),
#             ("title", title),
#             ("prompt", prompt),
#             ("difficulty", difficulty),
#             ("score", score),
#             ("time_limit", time_limit),
#             ("memory_limit", memory_limit),
#             ("options", options),
#             ("correct_answer", correct_answer),
#         ]:
#             if val is not None:
#                 body[key] = val
#
#         # Assemble coding_ext from top-level params only for coding questions.
#         # For update without question_type, infer from presence of coding-specific fields.
#         is_coding = question_type == "coding"
#         has_coding_fields = any(v is not None for v in [description, input_description, output_description, hint, test_cases, language_configs])
#         if is_coding or (action == "update" and has_coding_fields):
#             coding_ext = {}
#             for key, val in [
#                 ("description", description),
#                 ("input_description", input_description),
#                 ("output_description", output_description),
#                 ("hint", hint),
#             ]:
#                 if val is not None:
#                     coding_ext[key] = val
#             if test_cases is not None:
#                 coding_ext["test_cases"] = test_cases
#             if language_configs is not None:
#                 coding_ext["language_configs"] = language_configs
#             if coding_ext:
#                 body["coding_ext"] = coding_ext
#
#         if not body:
#             return _error("No fields to update")
#         _normalize_body_text(body)
#         result = await django_api("PATCH", f"/api/v1/question-bank-items/{question_id}/", ctx, json_body=body)
#
#         if warnings and isinstance(result, dict) and not result.get("error"):
#             result["warnings"] = warnings
#         return result
#
#     if action == "delete":
#         if not question_id:
#             return _error("question_id is required")
#         return await django_api("DELETE", f"/api/v1/question-bank-items/{question_id}/", ctx)
#
#     return _error(f"Unknown action: {action}")
#
#
# ---------------------------------------------------------------------------
# Tool 3: qjudge_exam — 競賽筆試題目 CRUD（場內題目列表與順序 → qjudge_contest_manager）
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_exam(
    action: str,
    contest_id: str,
    ctx: Context,
    question_id: str | None = None,
    question_type: str | None = None,
    prompt: str | None = None,
    explanation: str | None = None,
    score: int | None = None,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
    items: list[dict] | None = None,
    mode: str | None = None,
) -> Any:
    """Manage paper-exam questions within a paper_exam contest.

    Do NOT use this tool for coding contests or code execution — use qjudge_coding_problems or qjudge_code_runner instead.
    This tool only works with contests whose ``contest_type`` is ``paper_exam``.

    Actions:
      get              — Get one question (required: question_id)
      create           — Create ONE question (required: question_type, prompt; optional: explanation, score, options, correct_answer)
      update           — Update ONE question (required: question_id; optional: question_type, prompt, explanation, score, options, correct_answer)
      delete           — Delete ONE question (required: question_id). No batch delete — call once per question.
      import_from_bank — Import from question bank (required: items — list of {question_bank_id, question_id})
      batch_create     — Create multiple questions at once (required: items — list of question objects;
                         optional: mode — "append" (default) adds to existing, "overwrite" deletes all existing first)
                         Each item in items: {question_type, prompt, options, correct_answer, explanation?, score?}

    Use **qjudge_contest_manager** (list_problems, reorder) instead of list/reorder here.

    Parameter-action mapping (do NOT mix these up):
      question_id  → get, update, delete only
      items        → batch_create, import_from_bank only
      mode         → batch_create only
    """
    base = f"/api/v1/contests/{contest_id}/exam-questions"
    valid_actions = {"get", "create", "update", "delete", "import_from_bank", "batch_create"}
    uuid_error = _require_uuid(
        contest_id,
        field_name="contest_id",
        tool_name="qjudge_exam",
        hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
    )
    if uuid_error:
        return uuid_error
    if action not in valid_actions:
        return _tool_error(
            tool_name="qjudge_exam",
            detail=(
                f"Unknown action: {action!r}. "
                f"qjudge_exam supports: {sorted(valid_actions)}"
            ),
            status=400,
        )
    if action in {"get", "update", "delete"} and not question_id:
        return _tool_error(tool_name="qjudge_exam", detail="question_id is required")
    if action == "create":
        if not question_type:
            return _tool_error(tool_name="qjudge_exam", detail="question_type is required")
        if not prompt:
            return _tool_error(tool_name="qjudge_exam", detail="prompt is required")
    if action == "import_from_bank" and not items:
        return _tool_error(
            tool_name="qjudge_exam",
            detail="items is required (list of {question_bank_id, question_id})",
        )
    if action == "update":
        body = _build_exam_question_body(
            question_type=question_type,
            prompt=prompt,
            explanation=explanation,
            score=score,
            options=options,
            correct_answer=correct_answer,
        )
        if not body:
            return _tool_error(tool_name="qjudge_exam", detail="No fields to update")
    normalized_mode = mode or "append"
    if action == "batch_create":
        if not items:
            return _tool_error(tool_name="qjudge_exam", detail="items is required")
        if normalized_mode not in {"append", "overwrite"}:
            return _tool_error(tool_name="qjudge_exam", detail="mode must be one of: append, overwrite")

    type_error = await _ensure_contest_type(
        contest_id=contest_id,
        ctx=ctx,
        expected_type="paper_exam",
        tool_name="qjudge_exam",
        allowed_label="paper_exam",
        disallowed_tool_name="qjudge_coding_problems",
    )
    if type_error:
        return type_error

    if action == "get":
        return await django_api("GET", f"{base}/{question_id}/", ctx)

    if action == "create":
        body = _build_exam_question_body(
            question_type=question_type,
            prompt=prompt,
            explanation=explanation,
            score=score,
            options=options,
            correct_answer=correct_answer,
        )
        return await django_api("POST", f"{base}/", ctx, json_body=body)

    if action == "update":
        return await django_api("PATCH", f"{base}/{question_id}/", ctx, json_body=body)

    if action == "delete":
        return await django_api("DELETE", f"{base}/{question_id}/", ctx)

    if action == "import_from_bank":
        return await django_api("POST", f"{base}/import-from-bank/", ctx, json_body={"items": items})

    if action == "batch_create":
        deleted_count = 0
        if normalized_mode == "overwrite":
            existing = await django_api("GET", f"{base}/", ctx)
            if isinstance(existing, dict) and existing.get("error"):
                return existing
            if not isinstance(existing, list):
                return _tool_error(tool_name="qjudge_exam", detail="Expected exam question list during overwrite", status=500)
            for existing_item in existing:
                if not isinstance(existing_item, dict):
                    continue
                existing_id = existing_item.get("id")
                if not existing_id:
                    continue
                deleted = await django_api("DELETE", f"{base}/{existing_id}/", ctx)
                if isinstance(deleted, dict) and deleted.get("error"):
                    return deleted
                deleted_count += 1

        created_items: list[Any] = []
        for item in items:
            if not isinstance(item, dict):
                return _tool_error(tool_name="qjudge_exam", detail="Each batch item must be an object")
            body = _build_exam_question_body(
                question_type=item.get("question_type"),
                prompt=item.get("prompt"),
                explanation=item.get("explanation"),
                score=item.get("score"),
                options=item.get("options"),
                correct_answer=item.get("correct_answer"),
            )
            created = await django_api("POST", f"{base}/", ctx, json_body=body)
            if isinstance(created, dict) and created.get("error"):
                return created
            created_items.append(created)

        return {
            "status": "success",
            "mode": normalized_mode,
            "deleted_count": deleted_count,
            "created_count": len(created_items),
            "items": created_items,
        }

    return _tool_error(tool_name="qjudge_exam", detail=f"Unknown action: {action}", status=400)


# ---------------------------------------------------------------------------
# Tool 4: qjudge_grading — 作答查看 + 批改
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
    """Grade exam answers. Do NOT use this tool for question CRUD — use qjudge_exam or qjudge_coding_problems instead.

    Actions: list_answers, question_detail, dashboard, grade, batch_grade, ungrade."""
    base = f"/api/v1/contests/{contest_id}/exam-answers"
    uuid_error = _require_uuid(
        contest_id,
        field_name="contest_id",
        tool_name="qjudge_grading",
        hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
    )
    if uuid_error:
        return uuid_error

    if action == "list_answers":
        query: dict[str, str] = {}
        # participant_id maps to backend participant user identifier accepted by this endpoint.
        if participant_id:
            query["participant_id"] = participant_id
        if question_id:
            query["question_id"] = question_id
        suffix = f"?{urlencode(query)}" if query else ""
        raw = await django_api("GET", f"{base}/all-answers/{suffix}", ctx)
        return _compact_answers(raw)

    if action == "question_detail":
        if not question_id:
            return _tool_error(tool_name="qjudge_grading", detail="question_id is required")
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
            return _tool_error(tool_name="qjudge_grading", detail="exam_answer_id is required")
        if score is None:
            return _tool_error(tool_name="qjudge_grading", detail="score is required")
        body: dict[str, Any] = {"score": score}
        if feedback is not None:
            body["feedback"] = feedback
        result = await django_api("POST", f"{base}/{exam_answer_id}/grade/", ctx, json_body=body)
        if isinstance(result, dict) and result.get("error"):
            return result
        return {"status": "success", "exam_answer_id": exam_answer_id, "score": score}

    if action == "batch_grade":
        if not grades:
            return _tool_error(tool_name="qjudge_grading", detail="grades array is required")
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
            return _tool_error(tool_name="qjudge_grading", detail="exam_answer_id is required")
        result = await django_api("POST", f"{base}/{exam_answer_id}/ungrade/", ctx)
        if isinstance(result, dict) and result.get("error"):
            return result
        return {"status": "success", "exam_answer_id": exam_answer_id}

    return _tool_error(tool_name="qjudge_grading", detail=f"Unknown action: {action}", status=400)


# ---------------------------------------------------------------------------
# Tool 5: qjudge_coding_problems — 競賽程式題目管理（程式碼執行請用 qjudge_code_runner）
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_coding_problems(
    action: str,
    ctx: Context,
    contest_id: str | None = None,
    problem_id: str | None = None,
    title: str | None = None,
    difficulty: str | None = None,
    time_limit: int | None = None,
    memory_limit: int | None = None,
    description: str | None = None,
    input_description: str | None = None,
    output_description: str | None = None,
    hint: str | None = None,
    test_cases: list[dict] | None = None,
    language_configs: list[dict] | None = None,
    max_score: int | None = None,
) -> Any:
    """Manage **coding problems attached to a coding contest** (metadata + test cases + languages).

    ## When to use this tool (vs other tools)
      • Use **`qjudge_contest_manager`** → **get_detail**, **list_problems**, or **reorder** for a contest (needs `contest_id`).
      • Use **`qjudge_coding_problems`** → create/edit/delete **one** coding problem at a time (needs `contest_id` + `problem_id` for get/update/delete).
      • Use **`qjudge_code_runner`** → **run student/teacher code** against an existing problem's tests (needs `problem_id` + `code`). This tool has **no `code` parameter**.
      • **Bank item CRUD** is not exposed via MCP — use the product UI or REST APIs.
      • Use **`qjudge_exam`** → non-coding (paper) contests only.

    ## Preconditions
      • `contest_id` must refer to a contest with ``contest_type`` = **``coding``** (server checks; wrong type → 400 with hint to use qjudge_exam).

    ## ID semantics
      • `contest_id` — UUID of the contest.
      • `problem_id` — UUID of the **coding problem in that contest** (from **qjudge_contest_manager** ``list_problems`` or ``create`` / ``get``). Same logical problem as Django **Problem** id used by `qjudge_code_runner` when referring to that problem.

    ## Actions
      get     — Get problem detail (required: contest_id, problem_id)
      create  — Create a new problem (required: contest_id, title; optional: difficulty, time_limit,
                memory_limit, description, input_description, output_description, hint, test_cases,
                language_configs, max_score)
      update  — Update a problem (required: contest_id, problem_id; optional: same fields as create)
      delete  — Remove problem from contest (required: contest_id, problem_id)

    ## Payload (create/update)
      Pass fields at the **top level** (no `coding_ext` wrapper in MCP).

    Field format guide (create/update):
      description          — Problem description (Markdown)
      input_description    — Input format description
      output_description   — Output format description
      hint                 — Hint text
      test_cases           — [{input_data: "...", output_data: "...", is_sample: true/false,
                              weight_percent: 25, order: 0}]
      language_configs     — [{language: "python", template_code: "", is_enabled: true, order: 0}]
      max_score            — Optional numeric cap when supported by API
    """
    valid_actions = {"get", "create", "update", "delete"}
    if action not in valid_actions:
        return _tool_error(
            tool_name="qjudge_coding_problems",
            detail=(
                f"Unknown action: {action!r}. "
                f"qjudge_coding_problems supports: {sorted(valid_actions)}. "
                f"For code execution (including test_run), use qjudge_code_runner instead."
            ),
            status=400,
        )
    uuid_error = _require_uuid(
        contest_id,
        field_name="contest_id",
        tool_name="qjudge_coding_problems",
        hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
    )
    if uuid_error:
        return uuid_error
    if action in {"get", "update", "delete"}:
        pid_error = _require_uuid(
            problem_id,
            field_name="problem_id",
            tool_name="qjudge_coding_problems",
            hint="Use qjudge_contest_manager list_problems first to get problem_id.",
        )
        if pid_error:
            return pid_error
    if action == "create" and not title:
        return _tool_error(tool_name="qjudge_coding_problems", detail="title is required")

    warnings: list[str] = []
    if action == "create":
        if not description:
            warnings.append("missing description — problem will have no description")
        if not test_cases:
            warnings.append("missing test_cases — problem will have no test cases")
        if not language_configs:
            warnings.append("missing language_configs — problem will have no language enabled")

    if contest_id is not None:
        type_error = await _ensure_contest_type(
            contest_id=contest_id,
            ctx=ctx,
            expected_type="coding",
            tool_name="qjudge_coding_problems",
            allowed_label="coding",
            disallowed_tool_name="qjudge_exam",
        )
        if type_error:
            return type_error

    def _attach_warnings(result: Any) -> Any:
        """Merge warnings into the response if there are any."""
        if warnings and isinstance(result, dict) and not result.get("error"):
            result["warnings"] = warnings
        return result

    if action == "get":
        return await django_api("GET", f"/api/v1/contests/{contest_id}/problems/{problem_id}/", ctx)

    if action == "create":
        body: dict[str, Any] = {"title": title}
        for key, val in [
            ("difficulty", difficulty),
            ("time_limit", time_limit),
            ("memory_limit", memory_limit),
            ("description", description),
            ("input_description", input_description),
            ("output_description", output_description),
            ("hint", hint),
            ("test_cases", test_cases),
            ("language_configs", language_configs),
            ("max_score", max_score),
        ]:
            if val is not None:
                body[key] = val
        _normalize_body_text(body)
        result = await django_api("POST", f"/api/v1/contests/{contest_id}/problems/", ctx, json_body=body)
        return _attach_warnings(result)

    if action == "update":
        body = {}
        for key, val in [
            ("title", title),
            ("difficulty", difficulty),
            ("time_limit", time_limit),
            ("memory_limit", memory_limit),
            ("description", description),
            ("input_description", input_description),
            ("output_description", output_description),
            ("hint", hint),
            ("test_cases", test_cases),
            ("language_configs", language_configs),
            ("max_score", max_score),
        ]:
            if val is not None:
                body[key] = val
        if not body:
            return _tool_error(tool_name="qjudge_coding_problems", detail="No fields to update")
        _normalize_body_text(body)
        result = await django_api("PATCH", f"/api/v1/contests/{contest_id}/problems/{problem_id}/", ctx, json_body=body)
        return _attach_warnings(result)

    if action == "delete":
        return await django_api("DELETE", f"/api/v1/contests/{contest_id}/problems/{problem_id}/", ctx)

    # Future MCP (backend routes exist; re-enable when product needs them):
    # if action == "import_from_bank":
    #     return await django_api(
    #         "POST", f"/api/v1/contests/{contest_id}/problems/import-from-bank/",
    #         ctx, json_body={"items": items},
    #     )
    # if action == "update_score":
    #     return await django_api(
    #         "PATCH",
    #         f"/api/v1/contests/{contest_id}/problems/{problem_id}/score/",
    #         ctx,
    #         json_body={"max_score": max_score},
    #     )

    return _tool_error(tool_name="qjudge_coding_problems", detail=f"Unknown action: {action}", status=400)


# ---------------------------------------------------------------------------
# Tool 6: qjudge_code_runner — 程式碼執行驗證
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_code_runner(
    problem_id: str,
    language: str,
    code: str,
    ctx: Context,
) -> Any:
    """**Run source code** against **all** test cases stored on a **Problem** (management test_run API).

    ## When to use (vs qjudge_coding_problems)
      • **`qjudge_code_runner`** — you have **source code** to execute and want **judge output** (stdout, verdict per case, CE/WA/AC, etc.).
      • **`qjudge_coding_problems`** — you are **editing problem metadata** (title, tests, limits). It never executes `code`.

    ## What problem_id means
      • `problem_id` is the **CodingProblem / Problem UUID** — the same string as:
        - `id` on a problem object from **qjudge_contest_manager** ``list_problems`` or `qjudge_coding_problems` **get**, and
        - the `{id}` in POST `/api/v1/management/problems/{id}/test_run/`.
      • Do **not** pass `contest_id` here. Do **not** pass bank `question_id` unless that item is the same underlying problem id (usually use contest or management problem id from API responses).

    ## Execution model
      • Sends only `{language, code}` to the server. The backend runs **every** stored test case for that problem, in order.
      • There is **no** sample-only mode and **no** custom extra test cases in this API.

    ## Languages (must match Django judge / TestRunSerializer)
      Allowed: **cpp**, **c**, **python**, **java**. (javascript is **not** supported for this endpoint.)

    ## Response (typical)
      • JSON with `status` (overall), `results` array (per-case status, input, output, expected_output, etc.).

    Do NOT use this tool for problem CRUD — use qjudge_coding_problems instead.
    """
    uuid_error = _require_uuid(
        problem_id,
        field_name="problem_id",
        tool_name="qjudge_code_runner",
        hint="Use qjudge_contest_manager list_problems first to get problem_id.",
    )
    if uuid_error:
        return uuid_error
    if not language:
        return _tool_error(tool_name="qjudge_code_runner", detail="language is required")
    if not code or not code.strip():
        return _tool_error(tool_name="qjudge_code_runner", detail="code is required")

    normalized_language = _normalize_code_runner_language(language)
    if normalized_language is None:
        return _tool_error(
            tool_name="qjudge_code_runner",
            detail=(
                "Unsupported language for qjudge_code_runner. "
                "Use one of: cpp, c, python, java "
                "(aliases accepted: c++, python3, py)."
            ),
            status=400,
        )

    body: dict[str, Any] = {
        "language": normalized_language,
        "code": code,
    }
    # Judge runs can exceed the default 30s client timeout; avoid httpx ReadTimeout
    # surfacing as an empty FastMCP ToolError ("Error executing tool ...: ").
    return await django_api(
        "POST",
        f"/api/v1/management/problems/{problem_id}/test_run/",
        ctx,
        json_body=body,
        timeout=120.0,
    )


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
