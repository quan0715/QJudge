---
name: csv-editor
description: Use when the QJudge TA agent must create, inspect, filter, or patch a CSV artifact, especially grade.csv.
---

# CSV Artifact Operations

Use the dedicated `artifact_csv_*` tools. Do not parse CSV with string splitting or Python, and do not use `artifact_write` for a `.csv` file.

The optional `step` parameter is only for disambiguating duplicate filenames in one session.

## Size safety gate

CSV search, JSON export, and patch helpers read through a 200,000-character limit. Before the first helper call and after every patch:

```text
listing = artifact_list(filename="grade.csv")
assert listing["artifacts"][0]["size_bytes"] <= 180_000
```

Above `180_000` bytes, stop. Split the artifact or fix the helper before continuing; otherwise a patch can rewrite truncated data.

## Choose the operation

- API/MCP records to a new CSV: `artifact_csv_from_json`.
- Locally assembled `columns` and row dictionaries to a new CSV: `artifact_write_csv`.
- Count matching rows without returning them: `artifact_csv_search`.
- Select explicit columns and matching rows as records: `artifact_csv_to_json`.
- Merge cell changes into an existing CSV: `artifact_csv_patch`.
- Human-readable debugging only: `artifact_read`; never use it to parse or locate CSV rows.

## Core examples

Seed API records:

```text
artifact_csv_from_json(
  filename="grade.csv",
  records=response["items"],
  defaults={"score": "", "reason": "", "synced": ""},
)
```

Identity mapping requires non-empty records. Supply `column_mapping` when records are empty or source keys differ from CSV columns; dot paths such as `answer.text` are supported.

Read the next grading batch:

```text
batch = artifact_csv_to_json(
  filename="grade.csv",
  columns=["exam_answer_id", "score", "reason"],
  where={"synced": ""},
  limit=20,
)
```

For QJudge write-back, resolve `contest_id=<X>` first and map the local `reason` column to API `feedback`:

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

The acknowledgement has only `status`, `graded_count`, and `error_count`. Mark every row in the batch `synced="yes"` only when `error_count == 0` and `graded_count == len(grades)`; otherwise mark none, stop, and report aggregate counts. Follow `qjudge-exam-grading-sop` for confirmation and retry rules.

Patch existing rows without replacing the file:

```text
artifact_csv_patch(
  filename="grade.csv",
  key_column="exam_answer_id",
  updates=[{"exam_answer_id": 2673, "score": "6", "reason": "..."}],
)
```

Every update must contain the key column. Inspect `missing`; unknown update columns are ignored. Re-run the size safety gate after the patch.

## Never do this

- Read and split CSV text manually.
- Use pagination to find the next logical batch.
- Call `artifact_write_csv` with only changed rows; it replaces the whole file.
- Treat `exam_answer_id` or `username` as a row index.
- Pass raw `grade.csv` records directly to `batch_grade`.
