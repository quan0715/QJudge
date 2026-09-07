---
name: qjudge-exam-grading-sop
description: Use when a teacher asks the QJudge TA agent to grade, review, or write back open-ended exam answers in batches.
---

# QJudge Open-ended Exam Grading SOP

## Required context

Resolve both values before grading:

- `contest_id`
- `question_id`

Ask for missing values; never guess IDs.

## Artifacts

- `rubric.md`: grading criteria created with `artifact_write`.
- `grade.csv`: columns `index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced`.

## Artifact size guard

CSV search, JSON export, and patch read through a 200,000-character limit. Before the first CSV helper call and after every patch:

```text
listing = artifact_list(filename="grade.csv")
assert listing["artifacts"][0]["size_bytes"] <= 180_000
```

Above `180_000`, stop before another CSV helper. The artifact must be split or the tool fixed; continuing could rewrite truncated data.

## Stage 1: seed

1. Write `rubric.md`.
2. Fetch the grading projection:

```text
response = qjudge_grading(
  action="list_answers",
  contest_id=<X>,
  question_id=<Y>,
  projection="grading",
)
```

Each response item already contains the six source columns used by `grade.csv`.

3. Seed the CSV:

```text
artifact_csv_from_json(
  filename="grade.csv",
  records=response["items"],
  defaults={"score": "", "reason": "", "synced": ""},
)
```

4. Apply the artifact size guard.
5. Create one todo per batch of at most 20 answers.

## Stage 2: grade batches

Use `artifact_csv_search` for blank-score status and `artifact_csv_to_json` with explicit columns and `limit=20` for the next batch.

Grade each answer independently against `rubric.md`. Do not script or mechanically assign grades.

- Full score: `reason` may be empty.
- Non-full score: `reason` is required.
- If the teacher asks for feedback on every answer, always fill `reason`.

Patch only graded rows, update the todo, re-run the guard, then continue.

Do not use `artifact_read` pagination to locate ungraded rows.

## Stage 3: confirmation

After no blank `score` remains, stop and ask:

- confirm write-back: the reply must contain `寫回`
- cancel: do not call a grading write action

Do not reuse earlier approval.

## Stage 4: write back

Process at most 20 unsynced rows at a time.

1. Load `exam_answer_id`, `score`, and `reason`.
2. Convert the local column name `reason` to the API field `feedback`:

```text
grades = [
  {
    "exam_answer_id": row["exam_answer_id"],
    "score": row["score"],
    "feedback": row["reason"],
  }
  for row in batch["records"]
]

ack = qjudge_grading(
  action="batch_grade",
  contest_id=<X>,
  grades=grades,
)
```

The acknowledgement contains only `status`, `graded_count`, and `error_count`; it omits failed-row IDs.

- If `error_count == 0` and `graded_count == len(grades)`, mark every row in that batch `synced="yes"`.
- Otherwise mark none of the batch as synced, stop, and report the aggregate counts. Do not invent failed IDs.
- Do not automatically resubmit a partially successful batch. Regrading is not a no-op: it updates grading metadata and recalculates scores.

After a successful sync patch, update the todo, apply the size guard, and continue.

## Hard rules

- Build each MCP payload in the current turn.
- Every batch is declared in todos before work and marked completed immediately after success.
- A write-back requires a current user message containing `寫回`.
- Tool errors may be corrected once. Stop after the second failure.
