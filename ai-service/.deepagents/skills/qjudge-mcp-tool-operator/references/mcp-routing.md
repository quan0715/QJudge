# QJudge MCP Routing Notes

## Intent -> Tool
- 瀏覽教室與競賽資料：`qjudge_browse`
- 建立班級草稿考試、編輯設定、競賽詳情、場內題目列表、reorder：`qjudge_contest_manager`
- 管理筆試題：`qjudge_exam`
- 管理程式題：`qjudge_coding_problems`
- 跑 code 驗證：`qjudge_code_runner`
- 查作答與批改：`qjudge_grading`

## 建立與編輯考試
- 建立整場考試用 `qjudge_contest_manager(action="create")`，必填 `classroom_id`、`name`、`contest_type`（`paper_exam` 或 `coding`）。班級不明時先用 `qjudge_browse` 查詢。
- 成功回傳 `contest_id` 與 `contest_status`，新考試為草稿；使用回傳 ID 呼叫 `update` 編輯設定，或用題目工具新增題目。
- `create` 不接受既有考試專用的 `contest_id`、`rules`、`question_ids` 等參數；需要時建立成功後再 `update`／`reorder`。後端會檢查班級管理權限。
- 建立請求逾時或回應不明時，先列出該班級考試核對；不可盲目重試，因為每次 `create` 都可能新增另一場考試。

## High-frequency payload mistakes
- 用 `qjudge_exam` / `qjudge_coding_problems` 呼叫舊的 `list`：改用 `qjudge_contest_manager` 的 `list_problems`。
- 用 `qjudge_exam` 呼叫舊的 `reorder`：改用 `qjudge_contest_manager` 的 `reorder`。
- 把 `coding_ext` 傳給 `qjudge_coding_problems`：改成 top-level `description`, `test_cases`, `language_configs`。
- 在 `qjudge_code_runner` 少傳 `code`：補齊 `problem_id`, `language`, `code` 三欄。
- delete 傳陣列 id：改成單一 id。

## One-retry rule
- 第一次明確的參數驗證錯誤：依 tool 錯誤內容補欄位並重送一次。寫入結果不明時先查詢確認，不套用直接重試。
- 第二次仍錯：停止，不要連續嘗試同 action。
