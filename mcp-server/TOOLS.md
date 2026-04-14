# QJudge MCP Tools Reference

> **Last updated:** 2026-04-14
> **Source of truth:** `mcp-server/server.py`

---

## Overview

QJudge MCP Server 提供 5 個工具，透過 `action` 參數路由到不同操作。

| Tool | Purpose | Scope |
|---|---|---|
| `qjudge_browse` | 唯讀查詢 | classrooms, contests, banks |
| `qjudge_bank` | 題庫題目 CRUD | question bank items |
| `qjudge_exam` | 競賽筆試題管理 | paper_exam contests |
| `qjudge_coding` | 競賽程式題管理 + test_run | coding contests |
| `qjudge_grading` | 改卷 | exam answers |

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

## qjudge_bank

**題庫題目 CRUD**。支援 exam 和 coding 兩種題型。

### Parameters

| Param | Type | Used by | Notes |
|---|---|---|---|
| `action` | string | all | create, get, update, delete |
| `bank_id` | string? | create | 題庫 ID |
| `question_id` | string? | get, update, delete | 題目 ID (bank_item_id) |
| `question_type` | string? | create | `"exam"` or `"coding"` |
| `title` | string? | create, update | |
| `prompt` | string? | create, update | exam 題目敘述 |
| `difficulty` | string? | create, update | easy/medium/hard |
| `score` | int? | create, update | |
| `time_limit` | int? | create, update | ms |
| `memory_limit` | int? | create, update | MB |
| `options` | list[str]? | create, update | exam 選項，**不要加 A/B/C/D 前綴** |
| `correct_answer` | any? | create, update | 見下方格式說明 |
| `translations` | list[dict]? | create, update | coding 題翻譯 |
| `test_cases` | list[dict]? | create, update | coding 題測資 |
| `language_configs` | list[dict]? | create, update | coding 題語言設定 |
| `forbidden_keywords` | list[str]? | create, update | |
| `required_keywords` | list[str]? | create, update | |

### Actions

| Action | Required | Optional |
|---|---|---|
| `create` | bank_id, question_type, title | all field params |
| `get` | question_id | — |
| `update` | question_id | any field param |
| `delete` | question_id | — |

### Exam 題欄位格式

```json
{
  "action": "create",
  "bank_id": "...",
  "question_type": "exam",
  "title": "台灣首都",
  "prompt": "台灣的首都是哪裡？",
  "options": ["台北", "台中", "高雄", "台南"],
  "correct_answer": 0,
  "score": 10
}
```

- `options`: 純文字，**不加** A/B/C/D 前綴（UI 自動加）
- `correct_answer`:
  - single_choice: 0-based int index（如 `0`）
  - multiple_choice: int list（如 `[0, 2]`）
  - true_false: boolean（`true`/`false`），options 應為 `["True", "False"]`
  - short_answer/essay: string

### Coding 題欄位格式

```json
{
  "action": "create",
  "bank_id": "...",
  "question_type": "coding",
  "title": "A+B Problem",
  "difficulty": "easy",
  "time_limit": 1000,
  "memory_limit": 128,
  "translations": [{
    "language": "zh-hant",
    "title": "A+B Problem",
    "description": "給定兩個整數 A 和 B，輸出 A+B。",
    "input_description": "一行，包含兩個整數 A 和 B。",
    "output_description": "輸出 A+B 的結果。",
    "hint": ""
  }],
  "test_cases": [
    {"input_data": "1 2\n", "output_data": "3\n", "is_sample": true, "weight_percent": 0, "order": 0},
    {"input_data": "100 200\n", "output_data": "300\n", "is_sample": false, "weight_percent": 50, "order": 1},
    {"input_data": "-1 1\n", "output_data": "0\n", "is_sample": false, "weight_percent": 50, "order": 2}
  ],
  "language_configs": [
    {"language": "cpp", "template_code": "", "is_enabled": true, "order": 0},
    {"language": "python", "template_code": "", "is_enabled": true, "order": 1}
  ]
}
```

**重要規則：**
- `weight_percent`（不是 `score`）：所有 test_cases 的 weight_percent 總和必須 = 100
- sample 測資的 weight_percent 設 `0`（不計分）
- `language` 可選值：`cpp`, `python`, `java`, `javascript`
- translations/test_cases/language_configs 放**頂層**，不要用 `coding_ext` 包裝

---

## qjudge_exam

**競賽筆試題管理**。只能用於 `contest_type: "paper_exam"` 的競賽。

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
| `question_ids` | list[str]? | reorder |
| `items` | list[dict]? | batch_create, import_from_bank |
| `mode` | string? | batch_create |

### Actions

| Action | Required | Optional | Notes |
|---|---|---|---|
| `list` | contest_id | — | |
| `get` | contest_id, question_id | — | |
| `create` | contest_id, question_type, prompt | explanation, score, options, correct_answer | 一次一題 |
| `update` | contest_id, question_id | any field | 一次一題 |
| `delete` | contest_id, question_id | — | 一次一題，無批量 |
| `reorder` | contest_id, question_ids | — | question_ids 為全部題目 ID 的排序 |
| `import_from_bank` | contest_id, items | — | items: [{question_bank_id, question_id}] |
| `batch_create` | contest_id, items | mode | mode: "append"(default) / "overwrite" |

### Parameter-action mapping

```
question_id  → get, update, delete only
question_ids → reorder only
items        → batch_create, import_from_bank only
mode         → batch_create only
```

---

## qjudge_coding

**競賽程式題管理 + test_run**。只能用於 `contest_type: "coding"` 的競賽。

### Parameters

| Param | Type | Used by |
|---|---|---|
| `action` | string | all |
| `contest_id` | string? | list, get, create, update, import_from_bank, update_score, delete |
| `problem_id` | string? | get, update, update_score, delete, test_run |
| `title` | string? | create |
| `difficulty` | string? | create, update |
| `time_limit` | int? | create, update |
| `memory_limit` | int? | create, update |
| `translations` | list[dict]? | create, update |
| `test_cases` | list[dict]? | create, update |
| `language_configs` | list[dict]? | create, update |
| `forbidden_keywords` | list[str]? | create, update |
| `required_keywords` | list[str]? | create, update |
| `items` | list[dict]? | import_from_bank |
| `max_score` | int? | update_score |
| `language` | string? | test_run |
| `code` | string? | test_run |
| `use_samples` | bool | test_run (default: true) |
| `custom_test_cases` | list[dict]? | test_run |

### Actions

| Action | Required | Optional |
|---|---|---|
| `list` | contest_id | — |
| `get` | contest_id, problem_id | — |
| `create` | contest_id, title | difficulty, time_limit, memory_limit, translations, test_cases, language_configs, forbidden_keywords, required_keywords |
| `update` | contest_id, problem_id | same as create |
| `import_from_bank` | contest_id, items | — |
| `update_score` | contest_id, problem_id, max_score | — |
| `delete` | contest_id, problem_id | — |
| `test_run` | problem_id, language, code | use_samples, custom_test_cases |

### Create 完整範例

```json
{
  "action": "create",
  "contest_id": "...",
  "title": "島嶼數量",
  "difficulty": "easy",
  "time_limit": 1000,
  "memory_limit": 256,
  "translations": [{
    "language": "zh-hant",
    "title": "島嶼數量",
    "description": "給定一個由 0 與 1 組成的二維網格...",
    "input_description": "第一行包含兩個整數 R 與 C...",
    "output_description": "輸出一個整數，表示島嶼的總數量。",
    "hint": "使用 BFS 或 DFS。"
  }],
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
- 不要用 `coding_ext` 包裝（如果傳了會自動展開，但會收到棄用 warning）
- 不要用 `prompt`（題目內容透過 `translations[].description` 傳入）
- `weight_percent` 非 sample 測資總和必須 = 100
- `language_configs` 可選值：`cpp`, `python`, `java`, `javascript`

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
| `coding_ext: {translations: [...]}` 包裝 | translations 放頂層 |
| `prompt: "題目敘述"` 傳給 coding 題 | 用 `translations[].description` |
| `score: 50` 在 test_cases 裡 | 用 `weight_percent: 50` |
| options 加 `"A. 台北"` 前綴 | 純文字 `"台北"`，UI 自動加前綴 |
| `question_ids` 傳給 delete | delete 只接受單一 `question_id` |
| `items` 傳給 create | create 是單題，批量用 `batch_create` |
| 用 `qjudge_browse` 建題目 | browse 是唯讀，建題用 `qjudge_bank` |
