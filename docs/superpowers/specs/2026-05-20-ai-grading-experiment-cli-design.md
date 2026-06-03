# AI Grading Experiment CLI Design

Date: 2026-05-20

Note: QJudge Paper CLI V1 is defined separately as an OAuth-first product-like
CLI frontend in
`docs/superpowers/specs/2026-05-20-qjudge-paper-cli-oauth-first-design.md`.
This document defines the simplified experiment layer: blind multi-model
grading, deterministic three-model voting, and AI-vs-human aggregation.

## Purpose

This design defines a low-engineering-cost experiment workflow for evaluating
AI-assisted grading inside QJudge. The thesis scope remains the end-to-end
online exam system: exam setup, student answering, anti-cheat monitoring,
submission, grading, review, and result publication. AI grading is the final
output of that system and needs experimental validation for accuracy,
reliability, cost, and review workload reduction.

The first implementation target is a CLI workflow, not a frontend product flow.
The CLI lets us run controlled experiments such as:

```bash
qjudge-paper grade --contest-id <contest_id> --question-id <question_id> --model-id <model_a>
qjudge-paper grade --contest-id <contest_id> --question-id <question_id> --model-id <model_b>
qjudge-paper grade --contest-id <contest_id> --question-id <question_id> --model-id <model_c>
qjudge-paper compare \
  --human-baseline <run>/human_baseline.csv \
  -c model_a=<run-a>/grade.csv \
  -c model_b=<run-b>/grade.csv \
  -c model_c=<run-c>/grade.csv \
  --output-csv <comparison>/summary.csv
```

## Research Framing

The experiment has two layers.

| Layer | Purpose | Scope |
| --- | --- | --- |
| Single-question pilot | Validate blind prompts, per-model rubrics, grade artifacts, voting, and summary format | One selected question from Exam1 or Exam2 |
| Full-exam experiment | Measure total grading time, cost, score distribution, rank stability, and human review workload | All subjective questions in Exam1 or Exam2 |

The single-question pilot is required before the full-exam experiment. It
reduces risk because the same artifact and voting format can be verified on a
small sample before scaling to all questions.

## Experiment Design

### Stage 0: Blind Input and Human Baseline

For each experiment run, the system captures a stable blind input snapshot:

- contest id
- question id or full-exam scope
- question prompt
- max score
- reference answer / correct answer / teacher-provided answer key
- all student answers for the selected scope

Existing human score and feedback are exported separately into
`human_baseline.csv`. This baseline is the final comparison target, but it must
not be uploaded into the AI session or included in any model prompt during blind
grading. The CLI also attaches a tool policy to the AI session so
`qjudge_grading(list_answers)`, `qjudge_grading(question_detail)`, and
`qjudge_grading(dashboard)` are denied for blind grading runs. The CLI uploads
`question_context.json` instead, containing only the prompt, max score,
reference answer, options, and explanation.

### Stage 1: Independent AI Grading

Each AI model works independently. The models do not see existing human scores,
human feedback, or other model outputs during blind grading.

Recommended initial model set:

| Candidate | Role |
| --- | --- |
| OpenAI large model | AI grader A |
| DeepSeek thinking / large-context model | AI grader B |
| Claude large model | AI grader C |
| Human H0 | Existing human grading result used only as the final comparison target |

Each AI model produces its own rubric and grade file per question:

```text
model_a/q1/rubric.md
model_a/q1/grade.csv
model_b/q1/rubric.md
model_b/q1/grade.csv
model_c/q1/rubric.md
model_c/q1/grade.csv
human_baseline.csv
```

This is intentionally an end-to-end grading comparison. The experiment compares
each model's ability to generate a usable rubric and grade answers from only the
question, max score, reference answer, and student responses.

### Stage 2: Three-Model Voting

After blind grading, the CLI merges the three model grade files and computes a
deterministic voting result for each answer. This stage does not call another
LLM. The initial rule is:

- If at least two models assign the same score, use that score as the consensus
  score.
- If all three models assign different scores, use the median score as the
  consensus score and mark the answer for review.
- Always mark an answer for review when the model score range is greater than
  or equal to one point, even if two models agree.

The voting summary uses a fixed schema:

```csv
exam_answer_id,human_score,model_a_score,model_b_score,model_c_score,consensus_score,consensus_method,score_range,vote_counts,needs_review
```

### Stage 3: Aggregation

The CLI merges the candidate grades and human baseline into:

```text
summary.csv
metrics.json
report.md
```

`summary.csv` should include at least:

```csv
exam_answer_id,question_id,student_anonymous_id,max_score,human_h0_score,model_a_score,model_b_score,model_c_score,consensus_score,consensus_method,score_range,model_a_abs_error,model_b_abs_error,model_c_abs_error,consensus_abs_error,needs_review
```

For full-exam runs, the summary also includes participant-level totals:

```csv
student_anonymous_id,human_h0_total,model_a_total,model_b_total,model_c_total,consensus_total,total_delta_vs_h0,rank_h0,rank_consensus,rank_delta
```

### Stage 4: Human Final Audit

Human audit is not part of the first CLI MVP, but the data format should support
it. The CLI produces `needs_review` so the teacher can focus on high-risk
answers:

- large score range among candidates
- no two-model majority
- consensus differs from Human H0
- high max-score question

Later, the final product flow can show these high-priority answers in the
grading UI and let teachers confirm final scores.

## Metrics

### Single-Question Pilot Metrics

| Metric | Purpose |
| --- | --- |
| AI vs Human H0 MAE | Distance between each AI grader and existing human score |
| Consensus MAE vs Human H0 | Distance between voting consensus and existing human score |
| Exact agreement | Ratio of AI or consensus scores exactly matching Human H0 |
| Within 0.5 agreement | Ratio of AI or consensus scores within 0.5 point of Human H0 |
| Voting majority rate | How often at least two models assign the same score |
| Needs-review rate | Which answers should be manually checked first |
| Runtime / token / cost | Feasibility for full-exam scaling |

### Full-Exam Metrics

| Metric | Purpose |
| --- | --- |
| Total grading time | Whether one-click exam grading is operationally viable |
| Token and provider cost | Cost of large-model grading at exam scale |
| Total score distribution | Whether AI grading is globally lenient or strict |
| Rank correlation | Whether AI consensus preserves student ranking |
| Per-question MAE | Which questions are hardest for AI grading |
| High-disagreement answer rate | How much human review can be narrowed |
| Human review reduction estimate | Percentage of answers that can be skipped if only high-risk answers are audited |

## Artifact Layout

Local output path:

```text
reports/ai-grading/<exam_key>/<timestamp>/
```

Single-question example:

```text
reports/ai-grading/exam2/20260520-153000/
├── manifest.json
├── input_snapshot.json
├── question_context.json
├── model_a/q1/rubric.md
├── model_a/q1/grade.csv
├── model_b/q1/rubric.md
├── model_b/q1/grade.csv
├── model_c/q1/rubric.md
├── model_c/q1/grade.csv
├── human_baseline.csv
├── summary.csv
├── metrics.json
└── report.md
```

## Manifest

`manifest.json` is the source of truth for artifact traceability. It records:

- experiment run id
- exam key
- contest id
- scope type: `single_question` or `full_exam`
- question ids
- model ids
- session ids
- AI artifact ids
- local artifact paths
- prompt version
- created timestamp
- whether official scores were modified
- whether blind grading was enforced

Official scores must not be modified by default.

## CLI Configuration

Config files live under:

```text
experiments/grading/exam1.yml
experiments/grading/exam2.yml
```

Example:

```yaml
exam_key: exam2
contest_id: "00000000-0000-0000-0000-000000000000"

default_scope:
  type: single_question
  question_id: "11111111-1111-1111-1111-111111111111"

models:
  - candidate_id: model_a
    model_id: openai-large
    provider: openai
  - candidate_id: model_b
    model_id: deepseek-v4-flash
    provider: deepseek
  - candidate_id: model_c
    model_id: claude-large
    provider: anthropic

stages:
  blind_grading: true
  voting: true
  aggregate: true

write_back_scores: false
output_dir: reports/ai-grading
```

## Engineering Plan

### Phase 1: CLI Skeleton

Add or reuse:

```text
tools/qjudge-paper-cli/qjudge_paper_cli/app.py
tools/qjudge-paper-cli/qjudge_paper_cli/grading.py
tools/qjudge-paper-cli/qjudge_paper_cli/comparison.py
```

The CLI loads OAuth credentials, resolves classroom/contest/question scope,
creates an AI session, uploads a blind `grade.csv`, streams the durable AI run,
downloads artifacts, and writes a local manifest.

### Phase 2: Single-Question Blind Grading

For each configured AI model:

1. create or select a run output directory
2. export local-only `human_baseline.csv`
3. export and upload `question_context.json`
4. seed uploaded `grade.csv` with student answers only
5. prompt the model to produce `rubric.md`
6. prompt the model to fill `score` and `reason` in `grade.csv`
7. download artifacts locally
8. update `manifest.json`

### Phase 3: Claude Provider

Current `ai-service` supports OpenAI and DeepSeek. The experiment needs Claude
as the third large model.

Add:

- `langchain-anthropic`
- `ANTHROPIC_API_KEY`
- Claude canonical model id
- Anthropic branch in `ModelFactory`
- model contract tests

For MVP, Claude can be CLI-supported before it is exposed in the frontend model
picker.

### Phase 4: Voting and Comparison

Merge `human_baseline.csv` and the three candidate `grade.csv` files. Compute
per-answer majority/median consensus, score range, needs-review flags, and
per-model errors against Human H0.

### Phase 5: Summary and Report

Generate:

- `summary.csv`
- `metrics.json`
- `report.md`

The report should include:

- model list
- question count
- answer count
- runtime
- cost estimate when token usage is available
- per-model MAE vs Human H0
- consensus MAE vs Human H0
- disagreement summary
- top needs-review answers

### Phase 6: Full-Exam Mode

Extend the same pipeline from one question to all subjective questions.

Full-exam mode loops over question ids, then adds participant-level totals and
rank comparisons.

## Non-Goals

The CLI MVP does not:

- write AI grades back to official `ExamAnswer.score`
- replace the current frontend AI grading screen
- implement the final teacher audit UI
- require teachers to handwrite rubrics
- require all experiments to use a shared canonical rubric
- run another LLM round for model cross-review

## Safety and Data Integrity

Default behavior:

```text
write_back_scores: false
```

The experiment must never modify official grades unless an explicit future
`--apply-final` mode is implemented.

Student identifiers in exported CSV should use anonymized ids when used for
thesis analysis.

## Estimated Engineering Effort

| Work item | Estimate |
| --- | ---: |
| CLI skeleton and config loading | 0.5-1 day |
| Single-question grading orchestration | 2-3 days |
| Artifact download and manifest | 1 day |
| Claude provider support | 1 day |
| Human H0 export | 0.5 day |
| Voting and summary metrics | 1 day |
| Full-exam mode | 2-3 days |

Single-question MVP: 4-6 working days.

Full-exam experiment: additional 2-3 working days after the single-question path
is stable.

## Open Decisions

1. Which exact OpenAI large model should be used for `model_a`?
2. Which exact Claude model should be used for `model_c`?
3. Which Exam1 and Exam2 question ids should be used for the pilot?
4. Should full-exam mode include only subjective questions, or all non-objective questions with written explanations?
5. What score-range threshold should automatically mark an answer for manual review?

Recommended defaults:

- use one pilot question from Exam2 first
- keep official scores read-only
- treat the experiment as end-to-end grading, including model-generated rubrics
- use Human H0 only as the final evaluation target
