"""Grade-appeal comment tool.

The grade-appeal API uses the ``{data, meta}`` envelope, unlike the older DRF
payloads this server returns as-is. Projections stay here so list/get/send do
not put full question stems or answer serializers on the tool result.
"""

from typing import Any, Literal
from urllib.parse import quote

from mcp.server.mcpserver import Context, MCPServer
from mcp.types import ToolAnnotations

_MAX_CONTENT_LENGTH = 5000
_LIST_PROMPT_LIMIT = 120
_DETAIL_PROMPT_LIMIT = 240


def _truncate(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def _unwrap(payload: Any) -> Any:
    """Return the envelope payload, or the original body when it is not one.

    Error bodies already carry ``error: true`` from ``django_api`` and must pass
    through unchanged. A success envelope is ``{data, meta}`` with no ``errors``.
    """
    if isinstance(payload, dict) and payload.get("error") is True:
        return payload
    if isinstance(payload, dict) and "data" in payload and "errors" not in payload:
        return payload["data"]
    return payload


def _positive_int(value: Any, field_name: str, *, required: bool) -> tuple[int | None, dict[str, Any] | None]:
    import server

    if value is None:
        if required:
            return None, server._tool_error(tool_name="qjudge_appeals", detail=f"{field_name} is required")
        return None, None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        return None, server._tool_error(
            tool_name="qjudge_appeals",
            detail=f"{field_name} must be a positive integer.",
            status=400,
        )
    return value, None


def _clean_content(content: str | None) -> tuple[str | None, dict[str, Any] | None]:
    import server

    if not isinstance(content, str) or not content.strip():
        return None, server._tool_error(tool_name="qjudge_appeals", detail="content is required")
    text = content.strip()
    if len(text) > _MAX_CONTENT_LENGTH:
        return None, server._tool_error(
            tool_name="qjudge_appeals",
            detail=f"content must be at most {_MAX_CONTENT_LENGTH} characters.",
            status=400,
        )
    return text, None


def _summary(row: dict[str, Any]) -> dict[str, Any]:
    prompt = row.get("question_prompt")
    return {
        "appeal_id": row.get("id"),
        "exam_answer_id": row.get("exam_answer"),
        "question_id": row.get("question_id"),
        "question_label": row.get("question_label"),
        "question_order": row.get("question_order"),
        "student_id": row.get("student_id"),
        "student_username": row.get("student_username"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
        "closed_at": row.get("closed_at"),
        "last_message_at": row.get("last_message_at"),
        "question_prompt": _truncate(prompt, _LIST_PROMPT_LIMIT) if isinstance(prompt, str) and prompt else None,
    }


def _message(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "author_id": row.get("author_id"),
        "author_username": row.get("author_username"),
        "content": row.get("content"),
        "created_at": row.get("created_at"),
    }


def _invalid(detail: str) -> dict[str, Any]:
    import server

    return server._error(detail, status=502)


def _project_list(
    payload: Any,
    *,
    status: str | None,
    question_id: str | None,
    exam_answer_id: int | None,
) -> Any:
    if isinstance(payload, dict) and payload.get("error") is True:
        return payload
    data = _unwrap(payload)
    if not isinstance(data, list) or any(not isinstance(row, dict) for row in data):
        return _invalid("Invalid appeal list returned by Django")

    rows = data
    if status is not None:
        rows = [row for row in rows if row.get("status") == status]
    if question_id is not None:
        rows = [row for row in rows if str(row.get("question_id")) == question_id]
    if exam_answer_id is not None:
        rows = [row for row in rows if row.get("exam_answer") == exam_answer_id]
    return {"count": len(rows), "items": [_summary(row) for row in rows]}


def _project_detail(payload: Any, *, include_answer: bool, include_prompt: bool) -> Any:
    if isinstance(payload, dict) and payload.get("error") is True:
        return payload
    data = _unwrap(payload)
    if not isinstance(data, dict):
        return _invalid("Invalid appeal detail returned by Django")
    messages = data.get("messages")
    if not isinstance(messages, list) or any(not isinstance(item, dict) for item in messages):
        return _invalid("Invalid appeal messages returned by Django")

    projected = _summary(data)
    prompt = data.get("question_prompt")
    if include_prompt and isinstance(prompt, str):
        projected["question_prompt"] = prompt
    elif isinstance(prompt, str) and prompt:
        projected["question_prompt"] = _truncate(prompt, _DETAIL_PROMPT_LIMIT)
    projected["current_score"] = data.get("current_score")
    projected["current_max_score"] = data.get("current_max_score")
    projected["messages"] = [_message(item) for item in messages]
    if include_answer:
        answer = data.get("answer") if isinstance(data.get("answer"), dict) else {}
        projected["answer"] = answer.get("answer")
        projected["feedback"] = answer.get("feedback")
        projected["question_type"] = answer.get("question_type")
    return projected


def _project_send(payload: Any) -> Any:
    if isinstance(payload, dict) and payload.get("error") is True:
        return payload
    data = _unwrap(payload)
    if not isinstance(data, dict):
        return _invalid("Invalid appeal detail returned by Django")
    messages = data.get("messages")
    if not isinstance(messages, list) or not messages or not isinstance(messages[-1], dict):
        return _invalid("Appeal comment was not returned by Django")
    return {
        "status": "success",
        "appeal_id": data.get("id"),
        "appeal_status": data.get("status"),
        "message": _message(messages[-1]),
    }


async def _paper_exam(contest_id: str, ctx: Context) -> dict[str, Any] | None:
    import server

    contest = await server.django_api("GET", f"/api/v1/contests/{contest_id}/", ctx)
    if isinstance(contest, dict) and contest.get("error"):
        return contest
    actual = contest.get("contest_type") if isinstance(contest, dict) else None
    if actual == "paper_exam":
        return None
    return server._error(
        f"qjudge_appeals only supports paper_exam contests. This contest is {actual}.",
        status=400,
    )


async def qjudge_appeals(
    action: Literal["list", "get", "send"],
    contest_id: str,
    ctx: Context,
    appeal_id: int | None = None,
    content: str | None = None,
    status: Literal["open", "closed"] | None = None,
    question_id: str | None = None,
    exam_answer_id: int | None = None,
    include_answer: bool = False,
    include_prompt: bool = False,
) -> Any:
    """Read and send grade-appeal comments for one paper exam.

    Reads and appends comments in the connected, independently administered
    QJudge service. Sending notifies the other party. This tool does not change
    scores, feedback, or appeal status. Use qjudge_grading to grade.

    Actions:
      list — ticket summaries for this contest. Message bodies are omitted.
             Optional: status (open/closed), question_id, exam_answer_id.
      get  — one ticket and every comment in order. Required: appeal_id.
             Optional: include_answer, include_prompt.
      send — append one comment to an open ticket. Required: appeal_id, content
             (1-5000 characters after trimming). A closed ticket returns 409.
             This does not reopen the ticket and does not edit older comments.

    appeal_id is the integer from list/get, not the contest UUID. Students only
    see their own tickets; contest managers see every ticket in the contest.
    Comment text discusses the original answer. Do not add a new solution.
    """
    import server

    if action not in {"list", "get", "send"}:
        return server._tool_error(
            tool_name="qjudge_appeals",
            detail=f"Unknown action: {action}",
            status=400,
        )

    uuid_error = server._require_uuid(
        contest_id,
        field_name="contest_id",
        tool_name="qjudge_appeals",
        hint="Use qjudge_browse list_contests or list_classroom_contests first to get contest_id.",
    )
    if uuid_error:
        return uuid_error

    parsed_appeal_id: int | None = None
    if action in {"get", "send"}:
        parsed_appeal_id, appeal_error = _positive_int(appeal_id, "appeal_id", required=True)
        if appeal_error:
            return appeal_error

    parsed_answer_id: int | None = None
    if action == "list":
        parsed_answer_id, answer_error = _positive_int(exam_answer_id, "exam_answer_id", required=False)
        if answer_error:
            return answer_error
        if question_id is not None and (not isinstance(question_id, str) or not question_id.strip()):
            return server._tool_error(
                tool_name="qjudge_appeals",
                detail="question_id must be a non-empty string.",
                status=400,
            )
        if status is not None and status not in {"open", "closed"}:
            return server._tool_error(
                tool_name="qjudge_appeals",
                detail='status must be "open" or "closed".',
                status=400,
            )

    text: str | None = None
    if action == "send":
        text, content_error = _clean_content(content)
        if content_error:
            return content_error

    type_error = await _paper_exam(contest_id, ctx)
    if type_error:
        return type_error

    base = f"/api/v1/contests/{contest_id}/grade-appeals"
    if action == "list":
        raw = await server.django_api("GET", f"{base}/", ctx)
        return _project_list(
            raw,
            status=status,
            question_id=question_id.strip() if isinstance(question_id, str) else None,
            exam_answer_id=parsed_answer_id,
        )

    appeal_path = f"{base}/{quote(str(parsed_appeal_id), safe='')}/"
    if action == "get":
        raw = await server.django_api("GET", appeal_path, ctx)
        return _project_detail(raw, include_answer=include_answer, include_prompt=include_prompt)

    raw = await server.django_api("POST", f"{appeal_path}messages/", ctx, json_body={"content": text})
    return _project_send(raw)


def register_appeal_tool(mcp: MCPServer) -> Any:
    """Register the appeal comment tool and return the raw function."""
    mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        )
    )(qjudge_appeals)
    return qjudge_appeals
