# QJudge MCP Routing Notes

## Intent -> Tool
- 瀏覽資料（classroom/contest/bank）：`qjudge_browse`
- 競賽詳情、場內題目列表、reorder：`qjudge_contest_manager`
- 管理筆試題：`qjudge_exam`
- 管理程式題：`qjudge_coding_problems`
- 跑 code 驗證：`qjudge_code_runner`
- 查作答與批改：`qjudge_grading`

## High-frequency payload mistakes
- 用 `qjudge_exam` / `qjudge_coding_problems` 呼叫舊的 `list`：改用 `qjudge_contest_manager` 的 `list_problems`。
- 用 `qjudge_exam` 呼叫舊的 `reorder`：改用 `qjudge_contest_manager` 的 `reorder`。
- 把 `coding_ext` 傳給 `qjudge_coding_problems`：改成 top-level `description`, `test_cases`, `language_configs`。
- 在 `qjudge_code_runner` 少傳 `code`：補齊 `problem_id`, `language`, `code` 三欄。
- delete 傳陣列 id：改成單一 id。

## One-retry rule
- 第一次錯誤：依 tool 錯誤內容補欄位並重送一次。
- 第二次仍錯：停止，不要連續嘗試同 action。
