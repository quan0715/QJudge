# MCP Tool Restructure — 工具重分類與參數統一

**Date:** 2026-04-14
**Scope:** `mcp-server/server.py`, `mcp-server/tests/test_server.py`
**Goal:** 解決 AI 誤用 MCP 工具的根本原因：工具職責混淆、參數格式不一致、錯誤訊息不友善。

---

## 問題摘要

| 症狀 | 根因 |
|---|---|
| AI 用 `qjudge_discover` 建 coding 題，而非 `qjudge_coding` | `discover` 混了唯讀瀏覽 + 題庫寫入，名稱暗示萬用 |
| AI 傳 `coding_ext: {translations, ...}` 給 `qjudge_coding`，被靜默忽略 | 兩個工具對同樣資料用不同 shape |
| AI 傳 `score` 而非 `weight_percent`，Django 驗證失敗但錯誤不友善 | MCP 不做前置檢查，Django 錯誤未轉譯 |
| AI 傳 `question_ids` 給 delete，靜默忽略 | 未知參數不報錯 |

---

## 設計

### 1. 工具重分類

| 工具 | 職責 | Actions |
|---|---|---|
| `qjudge_browse` | 唯讀查詢 | list_classrooms, list_contests, get_contest, browse_banks, browse_bank_questions |
| `qjudge_bank` | 題庫題目 CRUD | create, get, update, delete |
| `qjudge_exam` | 競賽筆試題 CRUD | list, get, create, update, delete, reorder, batch_create, import_from_bank |
| `qjudge_coding` | 競賽程式題 CRUD + test_run | list, get, create, update, delete, reorder, import_from_bank, test_run |
| `qjudge_grading` | 改卷 | list_answers, question_detail, dashboard, grade, batch_grade, ungrade |

**Key change:** `qjudge_discover` 拆成 `qjudge_browse`（唯讀）和 `qjudge_bank`（寫入）。

### 2. 參數格式統一

所有工具的 coding 題欄位都用**頂層參數**，不用 `coding_ext` 包裝：

```
title, difficulty, time_limit, memory_limit,
translations[], test_cases[], language_configs[],
forbidden_keywords[], required_keywords[]
```

- `qjudge_bank` 的 create/update：接收頂層欄位，組裝成 `coding_ext` 再送 Django
- `qjudge_coding` 的 create/update：接收頂層欄位，直接送 Django（ProblemAdminSerializer 本身就用頂層欄位）
- 向後相容：如果收到 `coding_ext`，自動展開到頂層，但回傳 warning 提示使用頂層格式

Exam 題欄位維持現狀（`question_type`, `prompt`, `explanation`, `options`, `correct_answer`, `score`），不變。

### 3. 錯誤/建議回傳格式

取代現有 `_error()` 的 `{"error": true, "detail": "..."}` 格式。

#### 結構

```json
{
  "error": true,
  "errors": ["weight_percent total must equal 100 (got 80)"],
  "warnings": ["missing language_configs — problem will have no language enabled"],
  "hint": "test_cases format: [{input_data, output_data, is_sample, weight_percent, order}]"
}
```

- `errors[]`：阻擋性錯誤，必須修正才能繼續
- `warnings[]`：非阻擋性建議，可忽略但建議處理
- `hint`：格式提示，幫助 AI 自我修正

#### MCP 前置檢查（結構層級）

| 檢查項 | 類型 | 實作狀態 |
|---|---|---|
| 必填欄位缺失（如 create 缺 title） | error (via `_error()`) | Done |
| `coding_ext` 傳給 `qjudge_coding` | auto-unwrap + warning | Done |
| 缺少 translations | warning | Done |
| 缺少 language_configs | warning | Done |
| 缺少 test_cases | warning | Done |

**未實作的前置檢查（依賴 Django 驗證）：**
- `score` vs `weight_percent` 辨識 → Django 400 回傳後由 `_format_django_errors` 轉譯
- `prompt` 傳給 coding 工具 → 目前不攔截，Django 會忽略此欄位

#### Django 錯誤後處理

Django 回傳的錯誤由 `_format_django_errors()` 轉譯：
- 偵測 `custom_exception_handler` 包裝格式 `{success: false, error: {message, details}}`
- 展開 `details` 為 `errors[]` list
- 退化為 plain DRF dict → `errors[]` list

### 4. `qjudge_coding` 補 update action

- `action="update"`，必填 `contest_id` + `problem_id`
- PATCH 到 `/api/v1/contests/{contest_id}/problems/{problem_id}/`
- 使用 `ProblemAdminSerializer`（partial=True）
- 接受和 create 相同的可選欄位

### 5. Newline 正規化

維持現有 `_normalize_body_text()` 邏輯，套用到所有寫入路徑。

### 6. Contest type 防呆

維持現有 `_ensure_contest_type()` 機制：
- `qjudge_exam` 只接受 `paper_exam` contest
- `qjudge_coding` 只接受 `coding` contest

---

## 不在範圍內

- Django backend 改動（本次只動 MCP server）
- 前端改動
- OAuth / 認證流程

---

## 測試計畫

- 既有 50 個測試遷移到新工具名稱
- 新增測試：errors/warnings/hint 回傳格式
- 新增測試：`coding_ext` 自動展開 + warning
- 新增測試：未知參數報錯
- 新增測試：`qjudge_coding` update action
- 新增測試：`qjudge_bank` CRUD
- 新增測試：`qjudge_browse` 唯讀 actions
