# QJudge MCP Tools Reference

> **Last updated:** 2026-04-18
> **Source of truth:** `mcp-server/server.py`（參數與路由行為以此為準）

`qjudge_browse` → `get_help` 回傳的 JSON（`_TOOL_HELP`）與本文件對齊：**`tools`** 為各工具一句話摘要；**`coding_tools_how_to_choose`**、**`coding_problem_example`** / **`exam_question_example`**、**`common_mistakes`** 與下方「Common Mistakes」表意義相同。完整 **Parameters / Actions** 以本文件各節為準。

---

## Overview

QJudge MCP Server 提供 **6 個工具**（`qjudge_bank` 已自 MCP 移除，有需求再於 `server.py` 還原註解區塊），每個工具有明確的職責邊界。

| Tool | Purpose | Do NOT use for |
|---|---|---|
| `qjudge_browse` | 唯讀查詢 | 任何寫入操作 |
| `qjudge_contest_manager` | 競賽詳情、場內題目列表、題目順序 reorder | 單題 CRUD（請用 exam/coding 工具） |
| `qjudge_exam` | 競賽筆試題單題 CRUD / 批次 / 匯入 | coding contests, list/reorder 場內題目 |
| `qjudge_coding_problems` | 競賽程式題單題 CRUD | code execution, paper_exam, list 場內題目 |
| `qjudge_code_runner` | 程式碼執行驗證 | 題目 CRUD |
| `qjudge_grading` | 改卷 | 題目 CRUD |

---

## Response Format

### Success

直接回傳 Django API 的 JSON response。

### Error — MCP validation (blocking)

```json
{"error": true, "detail": "title is required"}
```

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

**唯讀查詢**，不做任何寫入。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `search` | string? | list_classrooms, list_contests |
| `status` | string? | list_contests |
| `contest_id` | string? | get_contest |
| `bank_id` | string? | browse_bank_questions |

### Actions

| Action | Description | Required params |
|---|---|---|
| `list_classrooms` | 列出你管理的教室 | — |
| `list_contests` | 列出你管理的競賽 | — |
| `get_contest` | 取得競賽詳情 | contest_id |
| `browse_banks` | 列出你的題庫 | — |
| `browse_bank_questions` | 列出題庫中的題目 | bank_id |
| `get_help` | 取得所有工具的完整使用指南 | — |

---

## qjudge_contest_manager

**競賽層級**：讀取競賽詳情、列出場內全部題目（依 `contest_type` 轉打 `.../problems/` 或 `.../exam-questions/`）、以及 **reorder** 題目順序。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `contest_id` | string? | get_detail, list_problems, reorder |
| `question_ids` | list[str]? | reorder（全部題目 ID 的順序） |

### Actions

| Action | Required | Notes |
|---|---|---|
| `get_detail` | contest_id | 等同 `GET /api/v1/contests/{id}/` |
| `list_problems` | contest_id | `coding` → problems；`paper_exam` → exam-questions |
| `reorder` | contest_id, question_ids | 依類型呼叫對應的 `.../reorder/` |

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
| `batch_create` | contest_id, items | mode | mode: "append"(default) / "overwrite" |

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
| `problem_id` | string? | get, update, delete |
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

### Actions

| Action | Required | Optional |
|---|---|---|
| `get` | contest_id, problem_id | — |
| `create` | contest_id, title | difficulty, time_limit, memory_limit, description, input_description, output_description, hint, test_cases, language_configs, max_score |
| `update` | contest_id, problem_id | same as create |
| `delete` | contest_id, problem_id | — |

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

**程式碼執行驗證**。對一道 coding 題依序跑**該題在系統內儲存的全部測資**，取得執行結果。

不需要 `action` 參數 — 這個工具只做一件事（後端只收 `language` + `code`，無自訂測資或僅跑 sample 的模式）。

### Parameters

| Param | Type | Required | Notes |
|---|---|---|---|
| `problem_id` | string | yes | 要測試的 coding problem ID |
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
| 用 `qjudge_browse` 建題目 | browse 是唯讀；列場內題目用 `qjudge_contest_manager`；單題 CRUD 用 `qjudge_exam` / `qjudge_coding_problems` |
| 仍呼叫 `qjudge_exam` / `qjudge_coding_problems` 的 `list` 或筆試的 `reorder` | 已移除；改 `qjudge_contest_manager` 的 `list_problems` / `reorder` |
| 用 `qjudge_coding_problems` 跑程式碼 | 用 `qjudge_code_runner`，coding 只管題目 CRUD |
| 以為 `qjudge_code_runner` 可選跑部分測資或帶自訂測資 | 後端固定跑該題儲存的全部測資；參數僅 `language` + `code` |
| `language: "javascript"` 於 code_runner | 此 endpoint 僅支援 `cpp` / `c` / `python` / `java` |
| exam 欄位傳給 coding 題 | coding 題用 description/test_cases；筆試欄位用 `qjudge_exam`（`paper_exam`） |
