# Flatten translations[] — 移除多語系陣列包裝

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Backend serializers/services, MCP server, QuestionAsset payload format

---

## 目標

`translations[]` 陣列從未真正用於多語系，所有程式碼都只存取 `translations[0]`。
將 `description`、`input_description`、`output_description`、`hint` 攤平為頂層欄位，移除陣列包裝。

## Before / After

### API 寫入（Before）
```json
{
  "title": "A+B",
  "translations": [{
    "language": "zh-hant",
    "title": "A+B",
    "description": "...",
    "input_description": "...",
    "output_description": "...",
    "hint": "..."
  }]
}
```

### API 寫入（After）
```json
{
  "title": "A+B",
  "description": "...",
  "input_description": "...",
  "output_description": "...",
  "hint": ""
}
```

### QuestionAsset.payload（Before）
```json
{
  "translations": [{"language": "zh-hant", "description": "...", ...}],
  "difficulty": "easy",
  ...
}
```

### QuestionAsset.payload（After）
```json
{
  "description": "...",
  "input_description": "...",
  "output_description": "...",
  "hint": "",
  "difficulty": "easy",
  ...
}
```

## 向後相容

- **寫入**：如果 API 收到舊格式 `translations[]`，自動展開 `translations[0]` 到頂層欄位（加 warning）
- **讀取**：payload 讀取時，如果遇到舊格式（有 `translations` key），自動轉換
- 現有 QuestionAsset 資料不需要 migration — 讀取時 lazy 轉換

## 改動範圍

### Backend — Serializers
- `ProblemAdminSerializer`: 移除 `translations` field，加 `description`、`input_description`、`output_description`、`hint`
- `TranslationInputSerializer`: 刪除（不再需要）
- `ProblemDetailSerializer.get_translations()` → `get_description()` 等
- `QuestionCodingExtSerializer` / `QuestionCodingExtReadSerializer`: translations → 攤平欄位
- `QuestionBankItemWriteSerializer`: coding_ext 內的 translations → 攤平

### Backend — Services
- `ProblemService.create_problem_adapter()`: `translations_data` → 直接讀頂層欄位
- `ProblemService.update_problem_adapter()`: 同上
- `write_coding_content_to_asset()`: `translations` 參數 → 攤平欄位

### Backend — Read paths
- `ProblemDetailSerializer`: 從 payload 讀攤平欄位
- `_coding_ext_from_membership()`: 同上
- `_pick_asset_translation()` → 不再需要
- `data_service._format_problem()`: 同上

### MCP Server
- `qjudge_coding` / `qjudge_bank`: `translations` 參數 → `description`、`input_description`、`output_description`、`hint`
- `_TOOL_HELP`: 更新範例
- `TOOLS.md`: 更新文件

### 不改
- `QuestionAsset` model（JSONField，不需 migration）
- 前端（跟著 API response shape 自動改）
- Judge（不碰 translations）
