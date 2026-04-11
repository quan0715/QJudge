"""QJudge MCP Server — exam question management tools."""

import json
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP, Context

from config import DJANGO_BASE_URL, MCP_HOST, MCP_PORT


async def django_api(
    method: str,
    path: str,
    ctx: Context,
    *,
    json_body: dict | None = None,
) -> str:
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
        return json.dumps({"status": "success"})

    try:
        body = response.json()
    except Exception:
        body = {"raw": response.text}

    if response.status_code >= 400:
        return json.dumps({
            "error": True,
            "status": response.status_code,
            "detail": body,
        }, ensure_ascii=False)

    return json.dumps(body, ensure_ascii=False)


def _strip_snapshots(raw: str) -> str:
    """Remove question_snapshot from exam answer responses to reduce size."""
    try:
        data = json.loads(raw)
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

    return json.dumps(data, ensure_ascii=False)


mcp = FastMCP(
    "QJudge",
    host=MCP_HOST,
    port=MCP_PORT,
    stateless_http=True,
    json_response=True,
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
) -> str:
    """查詢 QJudge 教室與競賽。

    Actions:
      - list_classrooms: 列出教室（可用 search 篩選名稱）
      - list_contests: 列出競賽（可用 search 篩選名稱，status 篩選狀態 draft/published/archived）
      - get_contest: 取得競賽詳情（需要 contest_id）

    Args:
        action: 操作類型（list_classrooms / list_contests / get_contest）
        search: 搜尋關鍵字
        status: 競賽狀態篩選（draft / published / archived）
        contest_id: 競賽 ID（get_contest 時必填）
    """
    if action == "list_classrooms":
        params = "?scope=manage"
        if search:
            params += f"&search={search}"
        return await django_api("GET", f"/api/v1/classrooms/{params}", ctx)

    if action == "list_contests":
        parts = []
        if search:
            parts.append(f"search={search}")
        if status:
            parts.append(f"status={status}")
        query = "?" + "&".join(parts) if parts else ""
        return await django_api("GET", f"/api/v1/contests/{query}", ctx)

    if action == "get_contest":
        if not contest_id:
            return json.dumps({"error": True, "detail": "contest_id is required"})
        return await django_api("GET", f"/api/v1/contests/{contest_id}/", ctx)

    return json.dumps({"error": True, "detail": f"Unknown action: {action}"})


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
) -> str:
    """管理競賽考試題目（CRUD + 排序）。

    Actions:
      - list: 列出所有題目
      - get: 取得單一題目（需要 question_id）
      - create: 新增題目（需要 question_type, prompt, score；選擇題需要 options, correct_answer）
      - update: 修改題目（需要 question_id，加上要改的欄位）
      - delete: 刪除題目（需要 question_id）
      - reorder: 重新排序（需要 question_ids，按新順序排列）

    Args:
        action: 操作類型（list / get / create / update / delete / reorder）
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID（get/update/delete 時必填）
        question_type: 題型（true_false / single_choice / multiple_choice / short_answer / essay）
        prompt: 題目內容（支援 Markdown）
        score: 配分（正整數）
        options: 選項列表（選擇題用，如 ["A", "B", "C", "D"]）
        correct_answer: 正確答案（是非題: true/false, 單選: int, 多選: [0,2], 簡答/申論: null）
        question_ids: 重新排序用的題目 ID 列表
    """
    base = f"/api/v1/contests/{contest_id}/exam-questions"

    if action == "list":
        return await django_api("GET", f"{base}/", ctx)

    if action == "get":
        if not question_id:
            return json.dumps({"error": True, "detail": "question_id is required"})
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
            return json.dumps({"error": True, "detail": "question_id is required"})
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
            return json.dumps({"error": True, "detail": "No fields to update"})
        return await django_api("PATCH", f"{base}/{question_id}/", ctx, json_body=body)

    if action == "delete":
        if not question_id:
            return json.dumps({"error": True, "detail": "question_id is required"})
        return await django_api("DELETE", f"{base}/{question_id}/", ctx)

    if action == "reorder":
        if not question_ids:
            return json.dumps({"error": True, "detail": "question_ids is required"})
        orders = [{"id": qid, "order": idx} for idx, qid in enumerate(question_ids)]
        return await django_api("POST", f"{base}/reorder/", ctx, json_body={"orders": orders})

    return json.dumps({"error": True, "detail": f"Unknown action: {action}"})


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
) -> str:
    """查看學生作答與批改考試。

    Actions:
      - list_answers: 列出所有學生作答（可用 participant_id 篩選特定學生）
      - question_detail: 某題的作答分析與答題分佈（需要 question_id）
      - dashboard: 競賽批改總覽（分數分佈、通過率、各題正確率）
      - grade: 批改一份作答（需要 exam_answer_id, score；可加 feedback）
      - ungrade: 撤銷批改（需要 exam_answer_id）

    Args:
        action: 操作類型（list_answers / question_detail / dashboard / grade / ungrade）
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID（question_detail 時必填）
        participant_id: 學生參與者 ID（list_answers 篩選用）
        exam_answer_id: 作答紀錄 ID（grade/ungrade 時必填）
        score: 給分（grade 時必填，0 以上，最多兩位小數）
        feedback: 批改回饋意見（grade 時可選）
    """
    base = f"/api/v1/contests/{contest_id}/exam-answers"

    if action == "list_answers":
        params = ""
        if participant_id:
            params = f"?participant_id={participant_id}"
        raw = await django_api("GET", f"{base}/all-answers/{params}", ctx)
        return _strip_snapshots(raw)

    if action == "question_detail":
        if not question_id:
            return json.dumps({"error": True, "detail": "question_id is required"})
        raw = await django_api("GET", f"{base}/question-detail/?question_id={question_id}", ctx)
        return _strip_snapshots(raw)

    if action == "dashboard":
        return await django_api("GET", f"{base}/dashboard-summary/", ctx)

    if action == "grade":
        if not exam_answer_id:
            return json.dumps({"error": True, "detail": "exam_answer_id is required"})
        if score is None:
            return json.dumps({"error": True, "detail": "score is required"})
        body: dict[str, Any] = {"score": score}
        if feedback is not None:
            body["feedback"] = feedback
        return await django_api("POST", f"{base}/{exam_answer_id}/grade/", ctx, json_body=body)

    if action == "ungrade":
        if not exam_answer_id:
            return json.dumps({"error": True, "detail": "exam_answer_id is required"})
        return await django_api("POST", f"{base}/{exam_answer_id}/ungrade/", ctx)

    return json.dumps({"error": True, "detail": f"Unknown action: {action}"})


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
