# QJudge MCP Server — Coding Problem CRUD

**Date:** 2026-04-11
**Status:** Draft
**Scope:** 新增 `qjudge_coding` MCP 工具，支援 coding problem 完整 CRUD + test_run

---

## Overview

在現有 MCP Server 中新增 `qjudge_coding` 工具，讓教師/助教透過 AI agent 管理程式題目。包含瀏覽、建立、修改、刪除題目，以及執行測試驗證程式碼。

### Key Principles

- 延續現有 MCP Server 架構：stateless thin proxy，所有業務邏輯在 Django 側
- 沿用 `django_api()` helper 做 HTTP 呼叫 + OAuth token 傳遞
- 所有查詢固定帶 `scope=manage`，僅回傳使用者有管理權限的題目
- Django 現有的 view、serializer、service layer 不需修改

## Tool Design

### `qjudge_coding` — 單一工具，`action` 參數切換操作

| Action | HTTP | Django Endpoint | Required Params |
|--------|------|-----------------|-----------------|
| `list` | GET | `/api/v1/problems/?scope=manage` | — |
| `get` | GET | `/api/v1/problems/{problem_id}/` | `problem_id` |
| `create` | POST | `/api/v1/problems/` | `title` |
| `update` | PATCH | `/api/v1/problems/{problem_id}/` | `problem_id` + 至少一個欄位 |
| `delete` | DELETE | `/api/v1/problems/{problem_id}/` | `problem_id` |
| `test_run` | POST | `/api/v1/problems/{problem_id}/test_run/` | `problem_id`, `language`, `code` |

### Parameters

```
action: str          — list | get | create | update | delete | test_run
problem_id: str      — UUID，get/update/delete/test_run 必填

# 查詢（list）
search: str          — 關鍵字搜尋 title
difficulty: str      — easy/medium/hard，逗號分隔可多選
tags: str            — tag slug，逗號分隔

# 基本欄位（create/update）
title: str
difficulty: str      — easy | medium | hard
slug: str
time_limit: int      — 毫秒
memory_limit: int    — MB
forbidden_keywords: list[str]
required_keywords: list[str]

# 巢狀資源（create/update，全部 optional）
test_cases: list[object]
  - input_data: str
  - output_data: str
  - is_sample: bool (default false)
  - weight_percent: int
  - order: int
  - is_hidden: bool (default false)

language_configs: list[object]
  - language: str (cpp | python | java | javascript)
  - template_code: str
  - is_enabled: bool (default true)

translations: list[object]
  - language: str (e.g. "en", "zh-TW")
  - title: str
  - description: str
  - input_description: str
  - output_description: str
  - hint: str

existing_tag_ids: list[str]   — 已存在的 tag UUID
new_tag_names: list[str]      — 新建 tag 名稱

# test_run
language: str        — cpp | python | java | javascript
code: str            — 要執行的程式碼
use_samples: bool    — 使用 sample test cases（default true）
custom_test_cases: list[object]
  - input: str
  - expected_output: str
```

### Response Handling

| Action | Response |
|--------|----------|
| `list` | Django ProblemListSerializer 結果（含 id, title, difficulty, stats, tags） |
| `get` | ProblemAdminSerializer 完整資料（含 test_cases, language_configs, translations） |
| `create` | 新建題目的完整資料 |
| `update` | 更新後的完整資料 |
| `delete` | `{"status": "deleted", "problem_id": "..."}` |
| `test_run` | Django 端完整執行結果（每筆測資的 stdout, stderr, status, time） |

## Implementation

### 檔案變更

1. **`mcp-server/server.py`** — 新增 `qjudge_coding` tool function（約 120 行）
2. **`mcp-server/tests/test_server.py`** — 新增對應測試

### Tool Function 結構

```python
@mcp.tool()
async def qjudge_coding(
    action: str,
    ctx: Context,
    problem_id: str | None = None,
    search: str | None = None,
    difficulty: str | None = None,
    tags: str | None = None,
    title: str | None = None,
    slug: str | None = None,
    time_limit: int | None = None,
    memory_limit: int | None = None,
    forbidden_keywords: list[str] | None = None,
    required_keywords: list[str] | None = None,
    test_cases: list[dict] | None = None,
    language_configs: list[dict] | None = None,
    translations: list[dict] | None = None,
    existing_tag_ids: list[str] | None = None,
    new_tag_names: list[str] | None = None,
    language: str | None = None,
    code: str | None = None,
    use_samples: bool = True,
    custom_test_cases: list[dict] | None = None,
) -> str:
    """Manage coding problems: list, view, create, edit, delete, and test-run code."""
```

### Action Routing 邏輯

```
list     → GET  /api/v1/problems/?scope=manage&search=...&difficulty=...&tags=...
get      → GET  /api/v1/problems/{problem_id}/
create   → POST /api/v1/problems/  body={title, difficulty, ...nested}
update   → PATCH /api/v1/problems/{problem_id}/  body={changed fields}
delete   → DELETE /api/v1/problems/{problem_id}/
test_run → POST /api/v1/problems/{problem_id}/test_run/  body={language, code, ...}
```

### Error Handling

沿用現有 `django_api()` 的錯誤處理模式：
- HTTP 4xx/5xx → 回傳 Django 的 error response body
- 缺少必填參數 → 在 MCP 層直接回傳錯誤訊息

## Testing

### Unit Tests（mcp-server/tests/test_server.py）

測試項目：
- 各 action 的 HTTP method 和 URL 正確性
- Query parameter 組裝（search, difficulty, tags）
- Create/Update body 組裝（含巢狀資源）
- test_run body 組裝
- Delete 回傳格式
- 缺少必填參數的錯誤處理

### 手動驗證

用 MCP client 連接 dev 環境：
1. `list` — 確認回傳題目清單
2. `create` — 建立新題（含 test_cases）
3. `get` — 取得剛建立的題目
4. `update` — 修改題目（更新 test_cases）
5. `test_run` — 提交程式碼驗證
6. `delete` — 刪除題目
