---
name: qjudge-exam-grading-sop
description: Use when a teacher asks the QJudge TA agent to grade, review, or write back open-ended exam answers.
---

# QJudge Open-ended Exam Grading

Follow the [core grading principles](references/core-principles.md). The runtime supplies
this SOP and those principles directly to both the main agent and grading subagents
whenever grading tools are available; no extra skill read or copied workflow is needed.

## Batch grading (when `get_grading_assignment` is available)

**Main agent:** call `get_grading_assignment`, then use `task` to delegate one unit to each
`general-purpose` subagent, working in small batches. The task description contains only a
short task label and the unit ID. Do not read the units' answers into the main context or
precompute grading judgments. Track the delegated work and summarize its verified results.

**Grading subagent:** when delegated a unit ID, grade that unit yourself. Call
`get_grading_unit` to read its questions, references, original teacher note and answers;
read a question group's sibling answers together. Derive the rubric, save drafts as you
grade, then submit and verify the unit. Keep original answers and detailed grading in
your own context and the stored unit, rather than returning them to the main agent.

Return only the unit ID, written/skipped/failed counts, verification status and any
unresolved IDs or errors. The main agent reports completion only when every assigned
unit has a verified result; otherwise report the unfinished units. Reading data or ending
a model turn does not mean the requested grading was completed.

Include a concise rubric (criteria and points)
in the first `save_grading_draft` call for every unit; later saves may omit it. At run completion,
the system exports the stored criteria and grades as `rubric.md` and `grade.csv` artifacts;
do not rewrite those files yourself. Every writable answer should end with a submitted grade, and your summary
should report what `submit_grading_unit` actually returned. Before claiming completion, call
`verify_grading_unit` to compare official scores and feedback with saved drafts. Fill any
`missing_draft_ids` first. Resubmit only `retry_answer_ids` via `submit_grading_unit(answer_ids=...)`,
then verify again. Report `conflicts` for teacher review; do not overwrite them. If a retry
makes no progress, report the remaining IDs instead of retrying indefinitely.

## Single-question grading with grade.csv

The task message wins over this section when they differ (file names, which rows, whether to write back).

### Inputs

- `contest_id` and `question_id`: take them from the task or page context; never invent IDs.
- Question, max score, answer key (`correct_answer`) and explanation: `qjudge_exam(action="get", contest_id=..., question_id=...)`; use `grading_prompt` for complete shared instructions. `qjudge_grading(action="question_detail")` is response/statistics data, not question content.

### Rubric

Write the rubric file (`rubric.md` unless the task names another) before grading. Base it on the question requirements and explicit teacher criteria; reference answers illustrate valid solutions, not additional requirements; reuse an existing rubric file for the same question. A teacher note overrides the rubric where they conflict; update the rubric to match the note.

### grade.csv

Columns: `index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced`.

If the task did not provide the CSV, seed it from `qjudge_grading(action="list_answers", projection="grading")` with `artifact_csv_from_json` (see `csv-editor`). Use `csv-editor` for every CSV read and patch.

### Grading

- Read every `answer_text` and grade it against the rubric; never assign scores mechanically.
- `score` is between 0 and the max score. Fill only `score` and `reason`.
- `reason`: one short sentence on why points were given or taken; required below full score. Use English when the student answered in English.

### Write back

Only when the teacher asked for it and the task does not forbid it. Send 20 rows per `qjudge_grading(action="batch_grade")` call, mapping `reason` to `feedback`. Mark the batch `synced="yes"` only when `error_count == 0` and `graded_count` equals the batch size; otherwise stop and report the counts without resubmitting.
