# QJudge MCP Tools Reference

> **Last updated:** 2026-10-03
> **Source of truth:** `mcp-server/server.py`（參數與路由行為以此為準）

`qjudge_browse` → `get_help` 回傳的 JSON（`_TOOL_HELP`）與本文件對齊：**`tools`** 為各工具一句話摘要；**`coding_tools_how_to_choose`**、**`coding_problem_example`** / **`exam_question_example`**、**`common_mistakes`** 與下方「Common Mistakes」表意義相同。完整 **Parameters / Actions** 以本文件各節為準。

---

## Overview

QJudge MCP Server 提供 **6 個工具**（`qjudge_bank` 已自 MCP 移除），每個工具有明確的職責邊界。

| Tool | Purpose | Do NOT use for |
|---|---|---|
| `qjudge_browse` | 教室/競賽定位（ID discovery） | 競賽操作（get_detail/list_problems/reorder） |
| `qjudge_contest_manager` | 建立班級草稿考試；讀取及編輯既有考試 | 模糊搜尋/定位 |
| `qjudge_exam` | 競賽筆試題單題 CRUD / 批次 / 匯入 | coding contests, list/reorder 場內題目 |
| `qjudge_coding_problems` | 競賽程式題單題 CRUD | code execution, paper_exam, list 場內題目 |
| `qjudge_code_runner` | 程式碼執行驗證 | 題目 CRUD |
| `qjudge_grading` | 改卷 | 題目 CRUD |

---

## Review annotation corrections (2026-10-03)

Annotations describe every action exposed by a tool. `destructiveHint: false`
means updates are only additive; retaining a record does not make overwriting
its existing values non-destructive.

| Tool | Annotation | Value | Portal justification |
|---|---|---|---|
| `qjudge_contest_manager` | `destructiveHint` | `true` | True: update overwrites contest settings, clear_fields removes saved start/end times, and reorder replaces existing question order. These changes can affect participants and are not purely additive. |
| `qjudge_contest_manager` | `openWorldHint` | `true` | True: the tool interacts with the connected QJudge service, which is administered independently of ChatGPT. It changes shared exam schedules, participation rules, and visibility affecting other users. OAuth and contest permissions constrain access but do not make those external effects local to the conversation. |
| `qjudge_grading` | `destructiveHint` | `true` | True: grade and batch_grade overwrite scores and feedback. ungrade clears the score, feedback, grader, grading timestamp, and correctness result. Existing grading information can be lost even though the original answer is retained. |
| `qjudge_browse` | `openWorldHint` | `true` | True: classroom and contest lookups read from the connected, independently administered QJudge API. Only get_help is local; the annotation covers the whole tool, including external reads. |
| `qjudge_exam` | `openWorldHint` | `true` | True: the tool reads, creates, updates, imports, and deletes shared paper-exam questions through the independently administered QJudge API. Authentication restricts access but does not make the service local to ChatGPT. |
| `qjudge_grading` | `openWorldHint` | `true` | True: the tool retrieves student answers and reads or changes grading records through the independently administered QJudge API. Grades and feedback are shared service data outside ChatGPT. |
| `qjudge_coding_problems` | `openWorldHint` | `true` | True: the tool reads and changes contest coding problems, test cases, and language settings through the independently administered QJudge API. These records exist outside ChatGPT. |
| `qjudge_code_runner` | `openWorldHint` | `true` | True: the tool sends source code to the independently administered QJudge API for execution by its judge infrastructure and returns execution results. Public-sample-only execution still interacts with an external service. |

All six tools expose actions that interact with the external QJudge service, so
all six declare `openWorldHint: true`. This annotation is independent of
`readOnlyHint`: external reads are still open-world interactions. It does not
grant additional permissions or change the API routes.

Deploy the MCP server through the normal release/CD workflow, then scan tools
in an editable Platform version and replace the corresponding justifications.
Do not retain the earlier explanations equating non-destructive with no record
deletion or closed-world with an authenticated API. A review-in-progress version
must not be cancelled merely to apply these changes without owner authorization.
The generic “needs further review” message is not approval or a specific code defect.

Reference: [MCP ToolAnnotations](https://modelcontextprotocol.io/specification/2025-06-18/schema#toolannotations).

---

## Response Format

### Success

直接回傳 Django API 的 JSON response。

### Error — MCP validation (blocking)

```json
{"error": true, "detail": "title is required"}
```

所有 MCP 使用錯誤訊息都會附帶 `get_help` 建議，例如：
`For usage, call qjudge_browse(action="get_help", tool_name="qjudge_exam").`

### Error — Django validation (blocking)

Django 的 ValidationError 會被轉譯成 `errors[]` list：

```json
{
  "error": true,
  "errors": ["test_cases: weight_percent total must equal 100"],
  "status": 400
}
```

### Warning (non-blocking)

成功回傳的 response 中附帶 `warnings`：

```json
{
  "id": "q-new",
  "title": "A+B",
  "warnings": ["missing language_configs — problem will have no language enabled"]
}
```

---

## qjudge_browse

**定位工具**：語意不清時先找 `classroom_id` / `contest_id`。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `search` | string? | list_classrooms, list_classroom_contests, list_contests |
| `status` | string? | list_classroom_contests, list_contests |
| `contest_id` | string? | get_contest |
| `classroom_id` | string? | get_classroom, list_classroom_contests |
| `tool_name` | string? | get_help（可選：單一工具） |

### Actions

| Action | Description | Required params |
|---|---|---|
| `list_classrooms` | 列出你管理的教室 | — |
| `get_classroom` | 取得教室詳情 | classroom_id |
| `list_classroom_contests` | 列出該教室考試 | classroom_id |
| `list_contests` | 列出你管理的競賽（自動跟隨分頁，最多 20 頁） | — |
| `get_contest` | 取得競賽詳情 | contest_id |
| `get_help` | 取得工具使用指南（可指定 tool_name） | — |

---

## qjudge_contest_manager

**競賽操作工具**：用 `classroom_id` 建立草稿考試；已知 `contest_id` 後，進行競賽層讀取、設定更新與題目順序調整。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `classroom_id` | string(UUID) | create：班級擁有者／管理者或平台管理員 |
| `contest_type` | `paper_exam` / `coding` | create（必填） |
| `contest_id` | string(UUID) | get_detail, list_problems, reorder, update |
| `question_ids` | list[string]? | reorder |
| `name` / `description` | string? | create, update；create 必填 name |
| `rules` | string? | update |
| `start_time` / `end_time` | string? (ISO 8601) | create, update |
| `attendance_check_enabled` / `cheat_detection_enabled` / `allow_multiple_joins` | bool? | create, update |
| `scoreboard_visible_during_contest` | bool? | update |
| `attendance_photo_policy` | string? (`room` / `room_and_selfie`) | update |
| `webcam_required` | bool?（嚴格考試模式是否也要求 webcam） | update |
| `clear_fields` | list? (`start_time` / `end_time`) | update：把列出的欄位設為 null；未傳的參數一律不送出 |

### Actions

| Action | Description | Required params |
|---|---|---|
| `create` | 建立班級內的草稿考試（POST） | classroom_id, name, contest_type |
| `get_detail` | 取得競賽詳情 | contest_id |
| `list_problems` | 列出競賽場內題目 | contest_id |
| `reorder` | 重排競賽題目順序 | contest_id, question_ids |
| `update` | 部分更新競賽設定（PATCH，只送有給的欄位） | contest_id + 至少一個設定欄位 |

`create` 呼叫 `POST /api/v1/classrooms/{classroom_id}/contests/`，由後端驗證班級管理權限、名稱長度與起訖時間。回傳的 `contest_id` 可直接交給 `update`、`qjudge_exam` 或 `qjudge_coding_problems`；`contest_status` 為 `draft`，不發布考試或成績。

```json
{"action":"create","classroom_id":"<班級 UUID>","name":"期中考","contest_type":"paper_exam"}
```

建立後若要編輯規則、拍照政策、webcam 或成績看板設定，再以回傳的 `contest_id` 呼叫 `update`。建立時若傳入只適用既有考試的參數，會回傳明確錯誤，不會默默忽略。重複 `create` 會建立另一場考試；若回應不明，先列出該班級考試確認，避免直接重試。

`update` 可改欄位見上表。`status`、`contest_type`、`results_published` 不開放，權限由後端 `ContestAccessPolicy` 判定。

---

## qjudge_exam

**競賽筆試題管理**。只能用於 `contest_type: "paper_exam"` 的競賽。  
**場內題目列表與 reorder** 請用 **`qjudge_contest_manager`**（`list_problems` / `reorder`）。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `contest_id` | string | all |
| `question_id` | string? | get, update, delete |
| `question_type` | string? | create, update |
| `prompt` | string? | create, update |
| `explanation` | string? | create, update |
| `score` | int? | create, update |
| `options` | list[str]? | create, update |
| `correct_answer` | any? | create, update |
| `items` | list[dict]? | batch_create, import_from_bank |
| `mode` | string? | batch_create |

### Actions

| Action | Required | Optional | Notes |
|---|---|---|---|
| `get` | contest_id, question_id | — | |
| `create` | contest_id, question_type, prompt | explanation, score, options, correct_answer | 一次一題 |
| `update` | contest_id, question_id | any field | 一次一題 |
| `delete` | contest_id, question_id | — | 一次一題，無批量 |
| `import_from_bank` | contest_id, items | — | items: [{question_bank_id, question_id}] |
| `batch_create` | contest_id, items | mode | mode: "append"(default) / "overwrite"。先驗證全部 items，overwrite 先建新題、全部成功才刪舊題；建立失敗會回滾已建的新題（回傳 `rolled_back`） |

### Parameter-action mapping

```
question_id  → get, update, delete only
items        → batch_create, import_from_bank only
mode         → batch_create only
```

---

## qjudge_coding_problems

**競賽程式題管理**（程式執行請用 `qjudge_code_runner`）。只能用於 `contest_type: "coding"` 的競賽。  
**場內題目列表**請用 **`qjudge_contest_manager`**（`list_problems`）。

MCP 僅暴露 **get / create / update / delete**；後端另有匯入題庫、調整分數等 REST，若未來產品要接再開。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `contest_id` | string? | get, create, update, delete |
| `binding_id` | string? | get, update, delete |
| `title` | string? | create |
| `difficulty` | string? | create, update |
| `time_limit` | int? | create, update |
| `memory_limit` | int? | create, update |
| `description` | string? | create, update |
| `input_description` | string? | create, update |
| `output_description` | string? | create, update |
| `hint` | string? | create, update |
| `test_cases` | list[dict]? | create, update |
| `language_configs` | list[dict]? | create, update |
| `max_score` | int? | create, update |

### ID 對應

`qjudge_contest_manager list_problems` 的每一項有兩個 ID，用途不同，混用會 404：

| 欄位 | 是什麼 | 給誰用 |
|---|---|---|
| `id` | 競賽題目 binding UUID | `qjudge_coding_problems` 的 `binding_id`（get / update / delete） |
| `problem_id` | CodingProblem UUID | `qjudge_code_runner` 的 `problem_id` |

### Actions

| Action | Required | Optional |
|---|---|---|
| `get` | contest_id, binding_id | — |
| `create` | contest_id, title | difficulty, time_limit, memory_limit, description, input_description, output_description, hint, test_cases, language_configs, max_score |
| `update` | contest_id, binding_id | same as create |
| `delete` | contest_id, binding_id | — |

### Create 完整範例

```json
{
  "action": "create",
  "contest_id": "...",
  "title": "島嶼數量",
  "difficulty": "easy",
  "time_limit": 1000,
  "memory_limit": 256,
  "description": "給定一個由 0 與 1 組成的二維網格...",
  "input_description": "第一行包含兩個整數 R 與 C...",
  "output_description": "輸出一個整數，表示島嶼的總數量。",
  "hint": "使用 BFS 或 DFS。",
  "test_cases": [
    {"input_data": "4 5\n1 1 0 0 0\n1 1 0 0 1\n0 0 0 1 1\n0 1 0 0 0\n", "output_data": "3\n", "is_sample": true, "weight_percent": 0, "order": 0},
    {"input_data": "1 1\n0\n", "output_data": "0\n", "is_sample": false, "weight_percent": 50, "order": 1},
    {"input_data": "3 3\n1 1 1\n1 1 1\n1 1 1\n", "output_data": "1\n", "is_sample": false, "weight_percent": 50, "order": 2}
  ],
  "language_configs": [
    {"language": "cpp", "template_code": "", "is_enabled": true, "order": 0},
    {"language": "python", "template_code": "", "is_enabled": true, "order": 1}
  ]
}
```

**注意：**
- 不要用 `prompt`（題目內容透過 `description` 傳入）
- `weight_percent` 非 sample 測資總和必須 = 100

---

## qjudge_code_runner

**程式碼執行驗證**。對一道 coding 題跑**公開範例測資**（隱藏與非範例測資不會跑），取得執行結果。

不需要 `action` 參數 — 這個工具只做一件事（後端只收 `language` + `code`，固定跑公開範例測資，無法帶自訂測資）。

### Parameters

| Param | Type | Required | Notes |
|---|---|---|---|
| `problem_id` | string | yes | `list_problems` 項目的 `problem_id` 欄位（CodingProblem UUID，不是 `id`） |
| `language` | string | yes | `cpp`, `c`, `python`, `java`（與後端 judge 一致；**不支援** `javascript` 於此 endpoint） |
| `code` | string | yes | 要執行的原始碼 |

### 範例

```json
{
  "problem_id": "...",
  "language": "python",
  "code": "a, b = map(int, input().split())\nprint(a + b)"
}
```

---

## qjudge_grading

**改卷與作答查看**。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `contest_id` | string | all |
| `question_id` | string? | list_answers, question_detail |
| `participant_id` | string? | list_answers |
| `exam_answer_id` | string? | grade, ungrade |
| `score` | float? | grade |
| `feedback` | string? | grade |
| `grades` | list[dict]? | batch_grade |
| `include_participants` | bool | question_detail (default: false) |
| `include_omitted` | bool | question_detail (default: false) |
| `include_full_titles` | bool | dashboard (default: false) |
| `projection` | string? | list_answers（`"grading"`：回傳 index / exam_answer_id / username / answer_text / original_score / original_feedback） |

### Actions

| Action | Required | Optional |
|---|---|---|
| `list_answers` | contest_id | question_id, participant_id |
| `question_detail` | contest_id, question_id | include_participants, include_omitted |
| `dashboard` | contest_id | include_full_titles |
| `grade` | contest_id, exam_answer_id, score | feedback |
| `batch_grade` | contest_id, grades | — |
| `ungrade` | contest_id, exam_answer_id | — |

### batch_grade 格式

```json
{
  "action": "batch_grade",
  "contest_id": "...",
  "grades": [
    {"exam_answer_id": "...", "score": 8, "feedback": "Good"},
    {"exam_answer_id": "...", "score": 5}
  ]
}
```

---

回傳 `graded_count`、`error_count`；有失敗項目時 `status` 為 `"partial"`，並以 `errors` 列出失敗的那幾筆（含原因），可只重送這些。

## Common Mistakes

| 錯誤 | 正確做法 |
|---|---|
| 在 MCP 傳 `coding_ext` | `qjudge_coding_problems` 不支援 — 請傳頂層 `description` / `test_cases` 等 |
| `translations: [{...}]` 陣列包裝 | 直接用 `description`、`input_description` 等頂層欄位 |
| `prompt: "題目敘述"` 傳給 coding 題 | 用 `description` |
| `score: 50` 在 test_cases 裡 | 用 `weight_percent: 50` |
| options 加 `"A. 台北"` 前綴 | 純文字 `"台北"`，UI 自動加前綴 |
| `question_ids` 傳給 delete | delete 只接受單一 `question_id` |
| `items` 傳給 create | create 是單題，批量用 `batch_create` |
| 用 `qjudge_browse` 做競賽操作 | `qjudge_browse` 只做 ID 定位；競賽操作改用 `qjudge_contest_manager` |
| 仍呼叫 `qjudge_exam` / `qjudge_coding_problems` 的 `list` 或筆試的 `reorder` | 已移除；改 `qjudge_contest_manager` 的 `list_problems` / `reorder` |
| 用 `qjudge_coding_problems` 跑程式碼 | 用 `qjudge_code_runner`，coding 只管題目 CRUD |
| 以為 `qjudge_code_runner` 可選跑部分測資或帶自訂測資 | 後端只跑公開範例測資，不跑隱藏測資；參數僅 `language` + `code` |
| `language: "javascript"` 於 code_runner | 此 endpoint 僅支援 `cpp` / `c` / `python` / `java` |
| exam 欄位傳給 coding 題 | coding 題用 description/test_cases；筆試欄位用 `qjudge_exam`（`paper_exam`） |
