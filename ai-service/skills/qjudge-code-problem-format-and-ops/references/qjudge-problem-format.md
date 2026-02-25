# QJudge Code Problem 格式基準（依目前程式碼）

## A. Problem payload 主要欄位（CRUD）

- `title`（必填）
- `difficulty`: `easy|medium|hard`
- `time_limit`（毫秒）
- `memory_limit`（MB）
- `visibility`: `public|private|hidden`
- `translations[]`（必填，至少一筆，見 B 節）
- `test_cases[]`
- `forbidden_keywords[]`
- `required_keywords[]`
- `language_configs[]`

**不需提供的欄位：**
- `slug`：由後端從 `title` 自動生成，重複時自動加後綴。不要在 payload 中提供。
- `display_id`：由後端自動分配。

## B. 多語系欄位（`translations[]`）

每筆至少包含：

- `language`
- `title`
- `description`
- `input_description`
- `output_description`

可選：`hint`

## C. 測資欄位

### C-1. CRUD payload（`test_cases[]`）欄位

- `input_data`
- `output_data`
- `is_sample`
- `is_hidden`
- `score`
- `order`

注意：字串內容不會自動 trim，換行與空白必須自行處理。

### C-2. DeepAgent patch（`/sample_test_cases`、`/test_cases`）欄位

- `input`
- `output`
- `is_sample`（`/test_cases` 需要）
- `is_hidden`（`/test_cases` 需要）
- `score`（`/test_cases` 需要）
- `order`

欄位命名對照：

- CRUD `test_cases[]` 用 `input_data` / `output_data`
- patch `json_patch_ops` 用 `input` / `output`

## D. 語言設定欄位（`language_configs[]`）

`language` 目前僅支援：`cpp|python|java|javascript`

## E. DeepAgent 寫入限制（重要）

### `prepare_problem_create` + commit

- `translations[]` 是**必填**欄位，至少需包含一筆 `zh-TW` 翻譯。
- `slug` 不需提供，後端會從 title 自動生成（支援中文），重複時自動加後綴。
- 目前 commit 實際落地以 Problem 基本欄位與 `translations[]` 為主；其他欄位請優先考慮 CRUD 或 YAML import。

### `prepare_problem_patch` + commit

目前支援：

- `/title`, `/difficulty`, `/time_limit`, `/memory_limit`
- `/translations`（整包或索引路徑）
- `/sample_test_cases`
- `/test_cases`（整包覆蓋，含 sample + hidden）

`/test_cases` 每筆需使用 patch 欄位：

- `input`
- `output`
- `is_sample`
- `is_hidden`
- `score`
- `order`

目前不支援直接 patch：

- `required_keywords`
- `forbidden_keywords`
- `language_configs`

建議：

- 需要整包替換測資時，優先使用 `prepare_test_cases_update`（底層即產生 `/test_cases` patch）。
- 使用 `/test_cases` 時必須提供完整陣列（sample + hidden），否則未提供的舊測資會被刪除。
- 使用 `/test_cases` 或 `/sample_test_cases` 時，請用 `input`/`output`，不要用 `input_data`/`output_data`。
