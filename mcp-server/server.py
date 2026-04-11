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
    """Call Django API with OAuth token passthrough.

    Extracts the Bearer token from the MCP request context and forwards it
    to Django. Returns the response body as a string for the AI to read.
    """
    headers: dict[str, str] = {}
    request_context = ctx.request_context
    if request_context and hasattr(request_context, "headers"):
        auth_header = request_context.headers.get("authorization", "")
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


mcp = FastMCP(
    "QJudge",
    host=MCP_HOST,
    port=MCP_PORT,
    stateless_http=True,
    json_response=True,
)


@mcp.tool()
async def list_exam_questions(contest_id: str, ctx: Context) -> str:
    """列出指定競賽的所有考試題目（含正確答案，僅限老師/助教）。

    Args:
        contest_id: 競賽 ID (UUID)
    """
    return await django_api(
        "GET",
        f"/api/v1/contests/{contest_id}/exam-questions/",
        ctx,
    )


@mcp.tool()
async def get_exam_question(contest_id: str, question_id: str, ctx: Context) -> str:
    """取得單一考試題目的詳細資訊（含正確答案）。

    Args:
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID
    """
    return await django_api(
        "GET",
        f"/api/v1/contests/{contest_id}/exam-questions/{question_id}/",
        ctx,
    )


@mcp.tool()
async def create_exam_question(
    contest_id: str,
    question_type: str,
    prompt: str,
    score: int,
    ctx: Context,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
) -> str:
    """在指定競賽中新增一道考試題目。

    Args:
        contest_id: 競賽 ID (UUID)
        question_type: 題型，可選值：true_false, single_choice, multiple_choice, short_answer, essay
        prompt: 題目內容（支援 Markdown）
        score: 配分（正整數）
        options: 選項列表（選擇題必填，如 ["選項A", "選項B", "選項C", "選項D"]）
        correct_answer: 正確答案。是非題用 true/false；單選題用選項索引 (int)；多選題用索引陣列 [0,2]；簡答/申論可為 null
    """
    body: dict[str, Any] = {
        "question_type": question_type,
        "prompt": prompt,
        "score": score,
    }
    if options is not None:
        body["options"] = options
    if correct_answer is not None:
        body["correct_answer"] = correct_answer

    return await django_api(
        "POST",
        f"/api/v1/contests/{contest_id}/exam-questions/",
        ctx,
        json_body=body,
    )


@mcp.tool()
async def update_exam_question(
    contest_id: str,
    question_id: str,
    ctx: Context,
    prompt: str | None = None,
    options: list[str] | None = None,
    correct_answer: Any | None = None,
    score: int | None = None,
    question_type: str | None = None,
) -> str:
    """修改指定考試題目，只需傳入要修改的欄位。

    Args:
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID
        prompt: 新的題目內容（支援 Markdown）
        options: 新的選項列表
        correct_answer: 新的正確答案
        score: 新的配分
        question_type: 新的題型
    """
    body: dict[str, Any] = {}
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
        return json.dumps({"error": True, "detail": "No fields to update"}, ensure_ascii=False)

    return await django_api(
        "PATCH",
        f"/api/v1/contests/{contest_id}/exam-questions/{question_id}/",
        ctx,
        json_body=body,
    )


@mcp.tool()
async def delete_exam_question(contest_id: str, question_id: str, ctx: Context) -> str:
    """刪除指定的考試題目。

    Args:
        contest_id: 競賽 ID (UUID)
        question_id: 題目 ID
    """
    return await django_api(
        "DELETE",
        f"/api/v1/contests/{contest_id}/exam-questions/{question_id}/",
        ctx,
    )


@mcp.tool()
async def reorder_exam_questions(
    contest_id: str,
    question_ids: list[str],
    ctx: Context,
) -> str:
    """重新排列考試題目的順序。

    Args:
        contest_id: 競賽 ID (UUID)
        question_ids: 按新順序排列的題目 ID 列表，例如 ["id-3", "id-1", "id-2"] 表示第三題變第一、第一題變第二、第二題變第三
    """
    orders = [{"id": qid, "order": idx} for idx, qid in enumerate(question_ids)]
    return await django_api(
        "POST",
        f"/api/v1/contests/{contest_id}/exam-questions/reorder/",
        ctx,
        json_body={"orders": orders},
    )


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
