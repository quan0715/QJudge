This document describes the QJudge Exam JSON import/export v2 minimum spec: `preview -> apply -> rollback`, including the "Copy AI Prompt" workflow.

---

## 1. JSON Format (`qjudge.exam.v1`)

Imported data must be a **single JSON object** (not an array):

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
      "prompt": "Which one is a Python keyword?",
      "score": 5,
      "options": ["var", "let", "def", "function"],
      "correct_answer": 2
    }
  ]
}
```

### Required Rules

- `version` must be `qjudge.exam.v1`.
- Root keys must be only `version`, `meta`, and `questions` (no unknown fields).
- `questions` must contain at least one item.
- `score` must be greater than 0.
- Allowed question types: `true_false`, `single_choice`, `multiple_choice`, `short_answer`, `essay`.

### Type-specific Rules

- `true_false`
  - `options` is optional; if present it must be `["True", "False"]`
  - `correct_answer` can be `0/1/true/false/"true"/"false"`
- `single_choice`
  - `options` must contain at least 2 items
  - `correct_answer` must be a valid integer option index
- `multiple_choice`
  - `options` must contain at least 2 items
  - `correct_answer` must be a non-empty array of integer option indexes
- `short_answer` / `essay`
  - `options` should not be provided
  - `correct_answer` is optional and can be a string/primitive

---

## 2. Import Flow (v2)

The import modal is a two-step flow:

1. Paste/upload JSON.
2. Choose an import mode.
3. Click **Preview Changes**.
4. Review summary (add/delete/keep/score delta).
5. Click **Apply Import**.
6. Use rollback if needed.

### Import Modes

- `append` (default): keep existing questions and append new ones.
- `replace_all`: delete all existing questions then import new ones (with explicit confirmation).
- `replace_manual_only`: delete only manual/JSON questions and keep bank-imported questions.

---

## 3. API Endpoints

- `POST /api/v1/contests/{id}/exam-questions/import/preview`
- `POST /api/v1/contests/{id}/exam-questions/import/apply`
- `POST /api/v1/contests/{id}/exam-questions/import/rollback`

### Request Fields

- preview/apply: `payload_json`, `import_mode`
- apply (optional): `fingerprint` (recommended from preview response)
- rollback: `session_id`

### Response Highlights

- preview: `summary`, `fingerprint`
- apply: `session_id`, `applied_summary`, `questions`
- rollback: `rolled_back`, `restored_count`, `session_id`

---

## 4. Copy AI Prompt Workflow

In the import modal, click **Copy AI Prompt**:

1. Paste the prompt into your AI tool.
2. Ask AI to return explanation + final JSON code block.
3. Copy the JSON object back into QJudge import.
4. Preview first, then apply.

---

## 5. Rollback and Lock Rules

- Every apply creates a rollback session (before/after snapshots).
- Rollback restores the state before that apply.
- If contest question editing is locked (`question_edit_locked`), preview/apply/rollback are all rejected.

---

## 6. Removed Legacy Flow

The old `batch-import` endpoint was removed. Direct overwrite shortcut is no longer supported.
