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

## E. MCP 工具限制（重要）

### `qjudge_coding`

- 目前支援：`list`、`get`、`create`、`import_from_bank`、`update_score`、`delete`、`test_run`
- 適合做競賽程式題管理與驗證 reference solution。
- `test_run` 需要既有 `problem_id`，且以題目既有 sample cases 或自訂測資執行。

目前限制：

- 尚未提供直接更新題目內容或整包替換測資的 MCP action。
- 若需求涉及 `translations`、hidden test cases、`language_configs` 等內容編修，必須明確說明目前 MCP 能力不足。

建議：

- 讀題先用 `qjudge_coding(action="get")`。
- 驗證解法必須用 `qjudge_coding(action="test_run")`，不要手推 expected output。
- 若需要改題目敘述或測資，先整理成明確變更清單，再告知使用者目前需補 MCP 能力或改走其他管理介面。
