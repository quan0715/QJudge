# QJudge Code Problem 格式基準（依目前程式碼）

## A. Problem payload 主要欄位（CRUD）

- `title`
- `difficulty`: `easy|medium|hard`
- `time_limit`（毫秒）
- `memory_limit`（MB）
- `visibility`: `public|private|hidden`
- `translations[]`
- `test_cases[]`
- `forbidden_keywords[]`
- `required_keywords[]`
- `language_configs[]`

## B. 多語系欄位（`translations[]`）

每筆至少包含：

- `language`
- `title`
- `description`
- `input_description`
- `output_description`

可選：`hint`

## C. 測資欄位（`test_cases[]`）

- `input_data`
- `output_data`
- `is_sample`
- `is_hidden`
- `score`
- `order`

注意：字串內容不會自動 trim，換行與空白必須自行處理。

## D. 語言設定欄位（`language_configs[]`）

`language` 目前僅支援：`cpp|python|java|javascript`

## E. DeepAgent 寫入限制（重要）

### `prepare_problem_create` + commit

目前 commit 實際落地以 Problem 基本欄位與 `translations[]` 為主；其他欄位請優先考慮 CRUD 或 YAML import。

### `prepare_problem_patch` + commit

目前支援：

- `/title`, `/difficulty`, `/time_limit`, `/memory_limit`
- `/translations`（整包或索引路徑）
- `/sample_test_cases`

目前不支援直接 patch：

- `required_keywords`
- `forbidden_keywords`
- `language_configs`
- 完整 hidden `test_cases`
