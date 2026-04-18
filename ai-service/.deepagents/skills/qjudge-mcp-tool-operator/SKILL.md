---
name: qjudge-mcp-tool-operator
description: Use this skill for QJudge MCP tasks, including contest/question browse, exam question CRUD, coding problem CRUD, code execution, and grading actions. Route by intent, apply minimal payload guards, and retry at most once on fixable tool errors.
---

# QJudge MCP Tool Operator

## Scope
- 只處理 QJudge MCP 任務：查詢、出題、程式題管理、執行程式、批改。
- 若使用者請求不在此範圍，停止工具流程並請使用者改成 QJudge 任務。

## Instructions
1. 先判斷意圖，再選唯一工具：
- 查詢教室/競賽/題庫：`qjudge_browse`
- 競賽層操作（contest 詳情、場內題目列表、reorder）：`qjudge_contest_manager`
- 筆試題 CRUD：`qjudge_exam`
- 程式題 CRUD：`qjudge_coding_problems`
- 執行程式碼：`qjudge_code_runner`
- 批改：`qjudge_grading`

2. 送出前做最小 payload guard：
- 列出場內題目一律用 `qjudge_contest_manager(action="list_problems")`；不要用 `qjudge_exam` / `qjudge_coding_problems` 的舊 `list`。
- 題目排序一律用 `qjudge_contest_manager(action="reorder")`；不要用 `qjudge_exam` 的舊 `reorder`。
- `qjudge_coding_problems`：不要傳 `coding_ext`，欄位要在 top-level。
- `qjudge_code_runner`：必須同時有 `problem_id`, `language`, `code`。
- `delete` 動作一律單一 id（例如 `question_id` 或 `problem_id`）。

3. 工具錯誤時的處理：
- 若是可修正的欄位錯誤，修正後重試一次。
- 同一請求最多重試一次；第二次仍失敗就回報錯誤與缺少欄位，不再循環。

## References
- 詳細路由與常見 payload 錯誤：`references/mcp-routing.md`
