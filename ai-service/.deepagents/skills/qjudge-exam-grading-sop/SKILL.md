---
name: qjudge-exam-grading-sop
description: Use when a teacher asks the QJudge TA agent to grade, review, or write back open-ended exam answers.
---

# QJudge Open-ended Exam Grading SOP

The task message wins over this SOP when they differ (file names, which rows, whether to write back).

## Inputs

- `contest_id` and `question_id`: take them from the task or page context; never invent IDs.
- Question, max score, answer key (`correct_answer`) and explanation: `qjudge_grading(action="question_detail")`.

## Rubric

Write the rubric file (`rubric.md` unless the task names another) before grading. Base it on the answer key and explanation; reuse an existing rubric file for the same question. A teacher note overrides the rubric where they conflict; update the rubric to match the note.

## grade.csv

Columns: `index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced`.

If the task did not provide the CSV, seed it from `qjudge_grading(action="list_answers", projection="grading")` with `artifact_csv_from_json` (see `csv-editor`). Use `csv-editor` for every CSV read and patch.

## Grading

- Read every `answer_text` and grade it against the rubric; never assign scores mechanically.
- `score` is between 0 and the max score. Fill only `score` and `reason`.
- `reason`: one short sentence on why points were given or taken; required below full score. Use English when the student answered in English.

## Write back

Only when the teacher asked for it and the task does not forbid it. Send 20 rows per `qjudge_grading(action="batch_grade")` call, mapping `reason` to `feedback`. Mark the batch `synced="yes"` only when `error_count == 0` and `graded_count` equals the batch size; otherwise stop and report the counts without resubmitting.
