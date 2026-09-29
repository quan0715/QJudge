"""QJudge MCP Server tools."""

import asyncio
import time
from typing import Any, Literal
from urllib.parse import quote, urlencode
from uuid import UUID

import httpx
import jwt
import uvicorn
from config import (
    DJANGO_BASE_URL,
    DJANGO_FORWARDED_PROTO,
    MCP_HOST,
    MCP_PORT,
    MCP_PUBLIC_URL,
    OAUTH_ISSUER_URL,
    OAUTH_JWKS_URL,
)
from exam_preview import build_exam_problem_preview
from jwt import PyJWKClient
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import Context, FastMCP
from mcp.types import ToolAnnotations
from starlette.routing import Route


_HTTP_CLIENT: tuple[asyncio.AbstractEventLoop, httpx.AsyncClient] | None = None


def _http_client() -> httpx.AsyncClient:
    """Return the shared Django client, created once per running event loop."""
    global _HTTP_CLIENT
    loop = asyncio.get_running_loop()
    if _HTTP_CLIENT is None or _HTTP_CLIENT[0] is not loop:
        _HTTP_CLIENT = (loop, httpx.AsyncClient(timeout=30.0))
    return _HTTP_CLIENT[1]


class DjangoTokenVerifier(TokenVerifier):
    """Verify OAuth tokens by forwarding to Django backend.

    Successful checks are remembered for ``_CACHE_TTL`` seconds so a burst of tool
    calls does not hit ``/users/me`` for every request.
    """

    _CACHE_TTL = 30.0

    def __init__(self) -> None:
        self._verified_until: dict[str, float] = {}

    async def verify_token(self, token: str) -> AccessToken | None:
        """Check token against Django. Return AccessToken if valid, None if not."""
        now = time.monotonic()
        if self._verified_until.get(token, 0.0) <= now:
            self._verified_until = {
                cached: expiry for cached, expiry in self._verified_until.items() if expiry > now
            }
            try:
                response = await _http_client().get(
                    f"{DJANGO_BASE_URL}/api/v1/users/me",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Forwarded-Proto": DJANGO_FORWARDED_PROTO,
                    },
                    timeout=10.0,
                )
            except (httpx.RequestError, httpx.TimeoutException):
                return None
            if response.status_code != 200:
                return None
            self._verified_until[token] = now + self._CACHE_TTL
        return AccessToken(
            token=token,
            client_id="qjudge",
            scopes=["mcp"],
        )


class QJudgeTokenVerifier(TokenVerifier):
    """Verify QJudge MCP JWTs locally and preserve opaque OAuth fallback."""

    def __init__(
        self,
        issuer: str = OAUTH_ISSUER_URL,
        jwks_client: PyJWKClient | None = None,
        opaque_fallback: TokenVerifier | None = None,
    ) -> None:
        self._issuer = issuer.rstrip("/")
        self._jwks_client = jwks_client or PyJWKClient(
            OAUTH_JWKS_URL,
            headers={"X-Forwarded-Proto": DJANGO_FORWARDED_PROTO},
        )
        self._opaque_fallback = opaque_fallback or DjangoTokenVerifier()

    async def verify_token(self, token: str) -> AccessToken | None:
        if not self._is_qjudge_resource_token(token):
            return await self._opaque_fallback.verify_token(token)
        try:
            # PyJWKClient fetches the key set with blocking urllib; keep it off the event loop.
            signing_key = (
                await asyncio.to_thread(self._jwks_client.get_signing_key_from_jwt, token)
            ).key
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["EdDSA"],
                issuer=self._issuer,
                audience="qjudge-mcp",
                options={
                    "require": ["iss", "sub", "aud", "scope", "iat", "exp"]
                },
            )
        except Exception:
            return None
        scopes = frozenset(str(claims["scope"]).split())
        if "mcp" not in scopes:
            return None
        return AccessToken(
            token=token,
            client_id=str(claims["sub"]),
            scopes=sorted(scopes),
        )

    @staticmethod
    def _is_qjudge_resource_token(token: str) -> bool:
        if token.count(".") != 2:
            return False
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            return False
        return (
            header.get("alg") == "EdDSA"
            and header.get("kid") == "qjudge-ai-ed25519-v1"
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
        response = await _http_client().request(
            method=method,
            url=url,
            headers=headers,
            json=json_body,
            timeout=timeout,
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


def _items(rows: list[Any]) -> dict[str, Any]:
    """Wrap a list in a FastMCP-friendly ``{"count": N, "items": [...]}`` envelope.

    FastMCP auto-generates structured content only for object-like returns
    (dict / dataclass / Pydantic); bare lists are serialized as separate
    TextContent blocks per item, which makes the LLM see "streaming JSON
    objects" instead of a proper JSON array. Wrapping keeps the wire shape
    unambiguous across clients.
    """
    return {"count": len(rows), "items": rows}


def _extract_results(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            return [row for row in results if isinstance(row, dict)]
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    return []


async def _get_all_rows(path: str, ctx: Context, *, max_pages: int = 20) -> list[dict[str, Any]] | dict[str, Any]:
    """GET a DRF list endpoint and follow ``page`` until ``next`` is empty.

    Returns the rows, or the error dict of the first failing request.
    """
    rows: list[dict[str, Any]] = []
    separator = "&" if "?" in path else "?"
    for page in range(1, max_pages + 1):
        payload = await django_api("GET", path if page == 1 else f"{path}{separator}page={page}", ctx)
        if isinstance(payload, dict) and payload.get("error"):
            return payload
        rows.extend(_extract_results(payload))
        if not (isinstance(payload, dict) and payload.get("next")):
            break
    return rows


def _quote(value: Any) -> str:
    """Make an id safe to use as a single URL path segment."""
    return quote(str(value), safe="")


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


_DETAIL_FETCH_CONCURRENCY = 8

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


def _compact_answers(raw: Any) -> Any:
    """Project all-answers response down to grading essentials."""
    data = raw
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
    return _items(compact_rows)


def _compact_answers_for_grading(raw: Any) -> Any:
    """Minimal projection for the open-ended grading SOP.

    Returns a dict ``{"count": N, "items": [...]}`` rather than a bare list,
    so FastMCP treats it as structured content (single JSON object block)
    instead of splitting the list across multiple TextContent blocks.
    Each row's keys already match the final answers.csv columns — the
    agent pipes ``result["items"]`` straight into
    artifact_write_csv_from_records with no remapping.
    """
    data = raw
    if not isinstance(data, list):
        return _items([])

    rows = []
    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            continue
        answer = item.get("answer") or {}
        rows.append({
            "index":             i,
            "exam_answer_id":    item.get("id"),
            "username":          item.get("participant_username"),
            "answer_text":       answer.get("text") if isinstance(answer, dict) else None,
            "original_score":    item.get("score"),
            "original_feedback": item.get("feedback") or "",
        })
    return _items(rows)


def _compact_question_detail(
    raw: Any,
    *,
    include_participants: bool = False,
    include_omitted: bool = False,
) -> Any:
    """Trim question detail payload for MCP usage."""
    data = raw
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

    return _error(
        f"{tool_name} only supports {allowed_label} contests. "
        f"This contest is {actual_type}. Use {disallowed_tool_name} instead.",
        status=400,
    )


def _normalize_newlines(value: str) -> str:
    """Convert literal backslash-n sequences to real newlines.

    AI models sometimes double-escape line breaks and send ``\\n`` as two
    characters instead of an actual newline. Only text without any real newline
    is treated as double-escaped, so multi-line content that legitimately
    contains ``\\n`` (for example ``printf("\\n")``) is left untouched.
    """
    if "\n" in value:
        return value
    return value.replace("\\n", "\n")


_CODING_TEXT_FIELDS = ("description", "input_description", "output_description", "hint")


def _normalize_body_text(body: dict[str, Any]) -> dict[str, Any]:
    """Normalise escaped newlines in the text fields of a request body (in place).

    Covers ``prompt``, the coding problem text fields and ``test_cases`` data.
    """
    for key in ("prompt", *_CODING_TEXT_FIELDS):
        value = body.get(key)
        if isinstance(value, str):
            body[key] = _normalize_newlines(value)
    for case in body.get("test_cases") or []:
        for key in ("input_data", "output_data"):
            if isinstance(case.get(key), str):
                case[key] = _normalize_newlines(case[key])
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
        "qjudge_contest_manager": "Contest operations: get_detail, list_problems, reorder, update settings (requires contest_id UUID)",
        "qjudge_exam": "Paper-exam contest questions: get, create, update, delete, batch_create, import_from_bank (no list/reorder — use qjudge_contest_manager)",
        "preview_exam_problem": "Read-only paper-exam problem preview: fetch current question and render the proposed student-facing problem UI",
        "qjudge_coding_problems": "Coding contest problems: get, create, update, delete (no list — use qjudge_contest_manager list_problems)",
        "qjudge_code_runner": "Execute code against a problem's sample test cases: run code, get results",
        "qjudge_grading": "Grading: list_answers, question_detail, dashboard, grade, batch_grade, ungrade",
    },
    "routing_rules": {
        "unknown_id": "If classroom_id/contest_id is unknown, use qjudge_browse first.",
        "contest_ops": "Once contest_id is known, use qjudge_contest_manager for get_detail/list_problems/reorder/update.",
        "single_item_crud": "Use qjudge_exam (paper_exam) or qjudge_coding_problems (coding) for single-item CRUD.",
        "preview_before_update": "Use preview_exam_problem before qjudge_exam update when the user should approve the proposed exam problem preview.",
        "code_execution": "Use qjudge_code_runner for running source code.",
    },
    "coding_tools_how_to_choose": {
        "summary": (
            "Several tools touch contests and code — pick by intent. "
            "qjudge_browse = classroom/contest discovery (find IDs); "
            "qjudge_contest_manager = get_detail + list_problems + reorder + update settings (needs contest_id); "
            "qjudge_exam = paper_exam question CRUD; "
            "qjudge_coding_problems = coding problem CRUD; "
            "qjudge_code_runner = execute code. "
            "Wrong tool = wrong API or 400 errors."
        ),
        "qjudge_coding_problems": {
            "use_when": "You need to CREATE/EDIT/DELETE **coding problems inside a coding contest** (single-item CRUD).",
            "requires": "contest_id (UUID) of a contest where contest_type is **coding**. binding_id = the `id` field (contest binding UUID) of the problem from list_problems — NOT the item's `problem_id` field.",
            "never": "Do NOT run user's source code here. No 'code' parameter. To **list all** problems in the contest, use **qjudge_contest_manager** ``list_problems`` — this tool has no ``list`` action.",
        },
        "qjudge_code_runner": {
            "use_when": "You need to **execute source code** against the problem's **stored** test cases (teacher/test-run).",
            "requires": "problem_id = **CodingProblem / Problem UUID** = the `problem_id` field of a list_problems item (same id as GET /api/v1/management/problems/{id}/). language + code strings.",
            "behavior": "Runs only the problem's public sample test cases; hidden and non-sample cases never run, and custom cases cannot be passed.",
            "never": "Do NOT use contest_id here. Do NOT create/update problems here.",
        },
        "id_confusion": (
            "contest_id identifies a contest. binding_id in qjudge_coding_problems identifies a **problem row bound to that contest**. "
            "qjudge_code_runner.problem_id is the **global problem UUID** (management problem id). "
            "A qjudge_contest_manager list_problems item has two ids: `id` (contest binding UUID) goes to "
            "qjudge_coding_problems binding_id (get/update/delete); `problem_id` (CodingProblem UUID) goes to qjudge_code_runner. "
            "Passing one where the other is expected returns 404."
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
        "test_run params removed": "qjudge_code_runner only sends language+code; only public sample cases run",
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
        # Also published as the resource metadata's scopes_supported, so MCP
        # clients request only "mcp" instead of every scope the issuer offers.
        required_scopes=["mcp"],
    ),
    token_verifier=QJudgeTokenVerifier(),
)

@mcp.tool(
    title="Preview exam problem",
    description=(
        "Use this when the user wants to edit a QJudge paper exam question but "
        "should review how the proposed exam problem will look before approving the actual update. "
        "This tool is read-only and does not modify the question."
    ),
    annotations=ToolAnnotations(
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
)
async def preview_exam_problem(
    contest_id: str,
    question_id: str,
    ctx: Context,
    question_type: str | None = None,
    prompt: str | None = None,
    explanation: str | None = None,
    score: int | None = None,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
) -> Any:
    """Fetch one paper-exam question and render the proposed problem preview."""
    uuid_error = _require_uuid(
        contest_id,
        field_name="contest_id",
        tool_name="preview_exam_problem",
        hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
    )
    if uuid_error:
        return uuid_error
    if not question_id:
        return _tool_error(tool_name="preview_exam_problem", detail="question_id is required")

    patch = _build_exam_question_body(
        question_type=question_type,
        prompt=prompt,
        explanation=explanation,
        score=score,
        options=options,
        correct_answer=correct_answer,
    )
    if not patch:
        return _tool_error(tool_name="preview_exam_problem", detail="No fields to preview")

    type_error = await _ensure_contest_type(
        contest_id=contest_id,
        ctx=ctx,
        expected_type="paper_exam",
        tool_name="preview_exam_problem",
        allowed_label="paper_exam",
        disallowed_tool_name="qjudge_coding_problems",
    )
    if type_error:
        return type_error

    current_question = await django_api(
        "GET",
        f"/api/v1/contests/{contest_id}/exam-questions/{_quote(question_id)}/",
        ctx,
    )
    if isinstance(current_question, dict) and current_question.get("error"):
        return current_question
    if not isinstance(current_question, dict):
        return _tool_error(
            tool_name="preview_exam_problem",
            detail="Expected an exam question object",
            status=500,
        )

    return build_exam_problem_preview(current_question, patch)


# ---------------------------------------------------------------------------
# Tool 1: qjudge_browse — 唯讀查詢教室、競賽、題庫
# ---------------------------------------------------------------------------

@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )
)
async def qjudge_browse(
    action: Literal[
        "list_classrooms",
        "get_classroom",
        "list_classroom_contests",
        "list_contests",
        "get_contest",
        "get_help",
    ],
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
        classrooms = await _get_all_rows(f"/api/v1/classrooms/?{urlencode(query)}", ctx)
        if isinstance(classrooms, dict):
            return classrooms
        if search and not classrooms:
            all_classrooms = await _get_all_rows("/api/v1/classrooms/?scope=manage", ctx)
            if isinstance(all_classrooms, dict):
                return all_classrooms
            classrooms = [
                row for row in all_classrooms
                if _matches_keyword(row, search, ("name", "description"))
            ]
        return _items([_compact_classroom(row) for row in classrooms])

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
        contests = await _get_all_rows(f"/api/v1/classrooms/{classroom_id}/contests/", ctx)
        if isinstance(contests, dict):
            return contests
        if status:
            contests = [row for row in contests if row.get("contest_status") == status]
        if search:
            contests = [
                row for row in contests
                if _matches_keyword(row, search, ("contest_name", "contest_description"))
            ]
        return _items([_compact_contest_from_classroom(row, classroom_id=classroom_id) for row in contests])

    if action == "list_contests":
        query: dict[str, str] = {"scope": "manage"}
        if search:
            query["search"] = search
        if status:
            query["status"] = status
        contests = await _get_all_rows(f"/api/v1/contests/?{urlencode(query)}", ctx)
        if isinstance(contests, dict):
            return contests

        # If backend name-only search misses, fallback to classroom contests and match name/description.
        if search and not contests:
            rooms = await _get_all_rows("/api/v1/classrooms/?scope=manage", ctx)
            if isinstance(rooms, dict):
                return rooms
            merged: dict[str, dict[str, Any]] = {}
            for room in rooms:
                cid = room.get("uuid")
                if not isinstance(cid, str) or not _is_uuid(cid):
                    continue
                room_contests = await _get_all_rows(f"/api/v1/classrooms/{cid}/contests/", ctx)
                if isinstance(room_contests, dict):
                    continue
                for row in room_contests:
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
            return _items(list(merged.values()))

        # The list serializer omits contest_type/delivery_mode, so fetch each detail,
        # with a cap on concurrent requests.
        gate = asyncio.Semaphore(_DETAIL_FETCH_CONCURRENCY)

        async def fetch_detail(contest_uuid: str) -> Any:
            async with gate:
                return await django_api("GET", f"/api/v1/contests/{contest_uuid}/", ctx)

        details = await asyncio.gather(
            *(fetch_detail(row["id"]) for row in contests if isinstance(row.get("id"), str))
        )
        compact = [
            _compact_contest_from_detail(detail)
            for detail in details
            if isinstance(detail, dict) and not detail.get("error")
        ]
        if search:
            compact = [row for row in compact if _matches_keyword(row, search, ("name", "description"))]
        return _items(compact)

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



# ---------------------------------------------------------------------------
# Tool 1b: qjudge_contest_manager — contest operations (requires contest_id UUID)
# ---------------------------------------------------------------------------
@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    )
)
async def qjudge_contest_manager(
    action: Literal["get_detail", "list_problems", "reorder", "update"],
    ctx: Context,
    contest_id: str | None = None,
    question_ids: list[str] | None = None,
    name: str | None = None,
    description: str | None = None,
    rules: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    attendance_check_enabled: bool | None = None,
    attendance_photo_policy: str | None = None,
    cheat_detection_enabled: bool | None = None,
    anticheat_device_policy: dict[str, Any] | None = None,
    clear_fields: list[Literal["start_time", "end_time"]] | None = None,
    scoreboard_visible_during_contest: bool | None = None,
    allow_multiple_joins: bool | None = None,
) -> Any:
    """Contest-scoped operations with explicit contest_id.

    Actions:
      get_detail    — Get contest detail (required: contest_id UUID)
      list_problems — List all contest problems/questions (required: contest_id UUID)
      reorder       — Reorder questions/problems (required: contest_id UUID, question_ids)
      update        — Partially update contest settings (required: contest_id UUID, at least one
                      of name, description, rules, start_time, end_time (ISO 8601),
                      attendance_check_enabled, attendance_photo_policy, cheat_detection_enabled,
                      anticheat_device_policy (object: {"desktop": {...}, "tablet": {...}}),
                      scoreboard_visible_during_contest, allow_multiple_joins). To clear
                      start_time or end_time, list the field in clear_fields (omitted
                      arguments are never sent). status, contest_type and results_published
                      are not editable here.
    """
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

    if action == "update":
        fields = {
            "name": name,
            "description": description,
            "rules": rules,
            "start_time": start_time,
            "end_time": end_time,
            "attendance_check_enabled": attendance_check_enabled,
            "attendance_photo_policy": attendance_photo_policy,
            "cheat_detection_enabled": cheat_detection_enabled,
            "anticheat_device_policy": anticheat_device_policy,
            "scoreboard_visible_during_contest": scoreboard_visible_during_contest,
            "allow_multiple_joins": allow_multiple_joins,
        }
        patch = {key: value for key, value in fields.items() if value is not None}
        for field in clear_fields or []:
            if field in patch:
                return _tool_error(
                    tool_name="qjudge_contest_manager",
                    detail=f"{field} cannot be both set and listed in clear_fields",
                )
            patch[field] = None
        if not patch:
            return _tool_error(
                tool_name="qjudge_contest_manager",
                detail="update requires at least one contest setting field",
            )
        return await django_api("PATCH", f"/api/v1/contests/{contest_id}/", ctx, json_body=patch)

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
        path = (
            f"/api/v1/contests/{contest_id}/problems/"
            if contest_type == "coding"
            else f"/api/v1/contests/{contest_id}/exam-questions/"
        )
        raw = await django_api("GET", path, ctx)
        if isinstance(raw, dict) and raw.get("error"):
            return raw
        if isinstance(raw, list):
            return _items(raw)
        return raw

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


# ---------------------------------------------------------------------------
# Tool 3: qjudge_exam — 競賽筆試題目 CRUD（場內題目列表與順序 → qjudge_contest_manager）
# ---------------------------------------------------------------------------

@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    )
)
async def qjudge_exam(
    action: Literal["get", "create", "update", "delete", "import_from_bank", "batch_create"],
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
                         optional: mode — "append" (default) adds to existing, "overwrite" replaces all existing;
                         new questions are created first and old ones deleted only after all succeed)
                         Each item in items: {question_type, prompt, options, correct_answer, explanation?, score?}

    Use **qjudge_contest_manager** (list_problems, reorder) instead of list/reorder here.

    Parameter-action mapping (do NOT mix these up):
      question_id  → get, update, delete only
      items        → batch_create, import_from_bank only
      mode         → batch_create only
    """
    base = f"/api/v1/contests/{contest_id}/exam-questions"
    uuid_error = _require_uuid(
        contest_id,
        field_name="contest_id",
        tool_name="qjudge_exam",
        hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
    )
    if uuid_error:
        return uuid_error
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
        return await django_api("GET", f"{base}/{_quote(question_id)}/", ctx)

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
        return await django_api("PATCH", f"{base}/{_quote(question_id)}/", ctx, json_body=body)

    if action == "delete":
        return await django_api("DELETE", f"{base}/{_quote(question_id)}/", ctx)

    if action == "import_from_bank":
        return await django_api("POST", f"{base}/import-from-bank/", ctx, json_body={"items": items})

    if action == "batch_create":
        bodies: list[dict[str, Any]] = []
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                return _tool_error(tool_name="qjudge_exam", detail=f"items[{index}] must be an object")
            if not item.get("question_type") or not item.get("prompt"):
                return _tool_error(
                    tool_name="qjudge_exam",
                    detail=f"items[{index}] requires question_type and prompt",
                )
            bodies.append(
                _build_exam_question_body(
                    question_type=item.get("question_type"),
                    prompt=item.get("prompt"),
                    explanation=item.get("explanation"),
                    score=item.get("score"),
                    options=item.get("options"),
                    correct_answer=item.get("correct_answer"),
                )
            )

        # Overwrite creates the new questions first and deletes the old ones only
        # after every create succeeded, so a failure never loses existing questions.
        old_ids: list[str] = []
        if normalized_mode == "overwrite":
            existing = await django_api("GET", f"{base}/", ctx)
            if isinstance(existing, dict) and existing.get("error"):
                return existing
            if not isinstance(existing, list):
                return _tool_error(tool_name="qjudge_exam", detail="Expected exam question list during overwrite", status=500)
            old_ids = [str(row["id"]) for row in existing if isinstance(row, dict) and row.get("id")]

        created_items: list[Any] = []
        for body in bodies:
            created = await django_api("POST", f"{base}/", ctx, json_body=body)
            if isinstance(created, dict) and created.get("error"):
                rolled_back = 0
                leftover: list[Any] = []
                for made in created_items:
                    made_id = made.get("id") if isinstance(made, dict) else None
                    if not made_id:
                        continue
                    cleanup = await django_api("DELETE", f"{base}/{_quote(made_id)}/", ctx)
                    if isinstance(cleanup, dict) and cleanup.get("error"):
                        leftover.append(made_id)
                    else:
                        rolled_back += 1
                created["rolled_back"] = rolled_back
                if leftover:
                    created["rollback_failed_ids"] = leftover
                return created
            created_items.append(created)

        deleted_count = 0
        for old_id in old_ids:
            deleted = await django_api("DELETE", f"{base}/{_quote(old_id)}/", ctx)
            if isinstance(deleted, dict) and deleted.get("error"):
                return {
                    **deleted,
                    "created_count": len(created_items),
                    "deleted_count": deleted_count,
                    "detail": "New questions were created but removing old questions failed; "
                    "the contest now holds both.",
                }
            deleted_count += 1

        return {
            "status": "success",
            "mode": normalized_mode,
            "deleted_count": deleted_count,
            "created_count": len(created_items),
            "items": created_items,
        }



# ---------------------------------------------------------------------------
# Tool 4: qjudge_grading — 作答查看 + 批改
# ---------------------------------------------------------------------------

@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    )
)
async def qjudge_grading(
    action: Literal["list_answers", "question_detail", "dashboard", "grade", "batch_grade", "ungrade"],
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
    projection: str | None = None,
) -> Any:
    """Grade exam answers. Do NOT use this tool for question CRUD — use qjudge_exam or qjudge_coding_problems instead.

    Actions: list_answers, question_detail, dashboard, grade, batch_grade, ungrade.

    list_answers supports `projection="grading"` which returns a minimal
    row shape (index / exam_answer_id / username / answer_text /
    original_score / original_feedback) tailored for the open-ended
    batch-grading SOP — it can be piped straight into
    artifact_write_csv_from_records without any column remapping.
    """
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
        if projection == "grading":
            return _compact_answers_for_grading(raw)
        return _compact_answers(raw)

    if action == "question_detail":
        if not question_id:
            return _tool_error(tool_name="qjudge_grading", detail="question_id is required")
        raw = await django_api("GET", f"{base}/question-detail/?{urlencode({'question_id': question_id})}", ctx)
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
        result = await django_api("POST", f"{base}/{_quote(exam_answer_id)}/grade/", ctx, json_body=body)
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
        failed = [item for item in results if isinstance(item, dict) and item.get("status") != "ok"]
        return {
            "status": "success" if not failed else "partial",
            "graded_count": result.get("graded_count", 0),
            "error_count": len(failed),
            "errors": failed,
        }

    if action == "ungrade":
        if not exam_answer_id:
            return _tool_error(tool_name="qjudge_grading", detail="exam_answer_id is required")
        result = await django_api("POST", f"{base}/{_quote(exam_answer_id)}/ungrade/", ctx)
        if isinstance(result, dict) and result.get("error"):
            return result
        return {"status": "success", "exam_answer_id": exam_answer_id}



# ---------------------------------------------------------------------------
# Tool 5: qjudge_coding_problems — 競賽程式題目管理（程式碼執行請用 qjudge_code_runner）
# ---------------------------------------------------------------------------

@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    )
)
async def qjudge_coding_problems(
    action: Literal["get", "create", "update", "delete"],
    ctx: Context,
    contest_id: str | None = None,
    binding_id: str | None = None,
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
      • Use **`qjudge_coding_problems`** → create/edit/delete **one** coding problem at a time (needs `contest_id` + `binding_id` for get/update/delete).
      • Use **`qjudge_code_runner`** → **run student/teacher code** against an existing problem's tests (needs `problem_id` + `code`). This tool has **no `code` parameter**.
      • **Bank item CRUD** is not exposed via MCP — use the product UI or REST APIs.
      • Use **`qjudge_exam`** → non-coding (paper) contests only.

    ## Preconditions
      • `contest_id` must refer to a contest with ``contest_type`` = **``coding``** (server checks; wrong type → 400 with hint to use qjudge_exam).

    ## ID semantics
      • `contest_id` — UUID of the contest.
      • `binding_id` — the `id` field of an item from **qjudge_contest_manager** ``list_problems`` (the contest binding UUID). Do **not** pass the item's `problem_id` field here — that is the CodingProblem UUID, which only `qjudge_code_runner` accepts; the contest routes return 404 for it.

    ## Actions
      get     — Get problem detail (required: contest_id, binding_id)
      create  — Create a new problem (required: contest_id, title; optional: difficulty, time_limit,
                memory_limit, description, input_description, output_description, hint, test_cases,
                language_configs, max_score)
      update  — Update a problem (required: contest_id, binding_id; optional: same fields as create)
      delete  — Remove problem from contest (required: contest_id, binding_id)

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
            binding_id,
            field_name="binding_id",
            tool_name="qjudge_coding_problems",
            hint="Use qjudge_contest_manager list_problems first to get binding_id (the item's `id`).",
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
        return await django_api("GET", f"/api/v1/contests/{contest_id}/problems/{binding_id}/", ctx)

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
        result = await django_api("PATCH", f"/api/v1/contests/{contest_id}/problems/{binding_id}/", ctx, json_body=body)
        return _attach_warnings(result)

    if action == "delete":
        return await django_api("DELETE", f"/api/v1/contests/{contest_id}/problems/{binding_id}/", ctx)


# ---------------------------------------------------------------------------
# Tool 6: qjudge_code_runner — 程式碼執行驗證
# ---------------------------------------------------------------------------

@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )
)
async def qjudge_code_runner(
    problem_id: str,
    language: str,
    code: str,
    ctx: Context,
) -> Any:
    """**Run source code** against the **public sample** test cases of a **Problem** (management test_run API).

    ## When to use (vs qjudge_coding_problems)
      • **`qjudge_code_runner`** — you have **source code** to execute and want **judge output** (stdout, verdict per case, CE/WA/AC, etc.).
      • **`qjudge_coding_problems`** — you are **editing problem metadata** (title, tests, limits). It never executes `code`.

    ## What problem_id means
      • `problem_id` is the **CodingProblem / Problem UUID** — the same string as:
        - the `problem_id` field (not `id`) of an item from **qjudge_contest_manager** ``list_problems``, and
        - the `{id}` in POST `/api/v1/management/problems/{id}/test_run/`.
      • Do **not** pass `contest_id` here. Do **not** pass bank `question_id` unless that item is the same underlying problem id (usually use contest or management problem id from API responses).

    ## Execution model
      • Sends only `{language, code}` to the server. The backend runs the problem's **public sample** test cases only; hidden and non-sample cases never run here.
      • This tool does not pass custom extra test cases.

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
    app = mcp.streamable_http_app()
    mcp_route = next(
        route
        for route in app.routes
        if isinstance(route, Route) and route.path == mcp.settings.streamable_http_path
    )
    app.routes.insert(
        0,
        Route(
            "/",
            endpoint=mcp_route.endpoint,
            methods=mcp_route.methods,
            name="mcp-root",
            include_in_schema=False,
        ),
    )
    uvicorn.run(
        app,
        host=mcp.settings.host,
        port=mcp.settings.port,
        log_level=mcp.settings.log_level.lower(),
    )
