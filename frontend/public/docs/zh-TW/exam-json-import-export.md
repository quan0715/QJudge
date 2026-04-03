本文件說明 QJudge Exam JSON 匯入/匯出 v2 最小規格：`preview -> apply -> rollback`，以及「複製 AI 提示詞」使用方式。

---

## 1. JSON 格式（`qjudge.exam.v1`）

匯入資料必須是**單一 JSON 物件**（不是陣列）：

```json
{
  "version": "qjudge.exam.v1",
  "meta": {
    "exported_at": "2026-04-04T00:00:00.000Z",
    "contest_name": "OS Midterm"
  },
  "questions": [
    {
      "question_type": "single_choice",
      "prompt": "下列哪個是 Python 關鍵字？",
      "score": 5,
      "options": ["var", "let", "def", "function"],
      "correct_answer": 2
    }
  ]
}
```

### 必要規則

- `version` 必須為 `qjudge.exam.v1`。
- root 只允許 `version`、`meta`、`questions`（不可有未知欄位）。
- `questions` 至少 1 題。
- `score` 必須大於 0。
- 題型僅允許：`true_false`、`single_choice`、`multiple_choice`、`short_answer`、`essay`。

### 題型規則

- `true_false`
  - `options` 可省略；若提供必須是 `["True", "False"]`
  - `correct_answer` 可用 `0/1/true/false/"true"/"false"`
- `single_choice`
  - `options` 至少 2 個
  - `correct_answer` 必須是有效索引整數
- `multiple_choice`
  - `options` 至少 2 個
  - `correct_answer` 必須是非空整數索引陣列
- `short_answer` / `essay`
  - 不應提供 `options`
  - `correct_answer` 可省略或為字串/基本型別

---

## 2. 匯入流程（v2）

前端匯入 Modal 統一採兩段式：

1. 貼上/上傳 JSON。
2. 選擇匯入模式。
3. 按「預覽變更」。
4. 檢查摘要（新增/刪除/保留/總分變化）。
5. 按「套用匯入」。
6. 若要回復，使用 rollback。

### 匯入模式

- `append`（預設）：保留現有題目，將新題目加到尾端。
- `replace_all`：刪除現有題目後匯入新題目（需二次確認）。
- `replace_manual_only`：只刪除手動建立與 JSON 匯入題，保留題庫匯入題。

---

## 3. API 端點

- `POST /api/v1/contests/{id}/exam-questions/import/preview`
- `POST /api/v1/contests/{id}/exam-questions/import/apply`
- `POST /api/v1/contests/{id}/exam-questions/import/rollback`

### 請求欄位

- preview/apply：`payload_json`、`import_mode`
- apply（可選）：`fingerprint`（建議帶入 preview 回傳值）
- rollback：`session_id`

### 回應重點

- preview：`summary`、`fingerprint`
- apply：`session_id`、`applied_summary`、`questions`
- rollback：`rolled_back`、`restored_count`、`session_id`

---

## 4. AI 提示詞複製（外部 AI 生成再貼回）

在匯入 Modal 內按「複製 AI 提示詞」後：

1. 貼到你使用的 AI 工具。
2. 讓 AI 回覆「說明 + 最終 JSON code block」。
3. 複製 JSON 物件貼回 QJudge 匯入框。
4. 先預覽，再套用。

---

## 5. 回滾與限制

- 每次 apply 都會建立可回滾 session（含 before/after snapshot）。
- rollback 會還原到該次 apply 前狀態。
- 若競賽已進入題目編輯鎖定（`question_edit_locked`），preview/apply/rollback 都會被拒絕。

---

## 6. 移除舊流程

舊端點 `batch-import` 已移除，系統不再支援「直接覆蓋」捷徑。
