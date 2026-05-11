# CEEC Question Groups and Math Editor P0 Design

## Context

QJudge currently supports paper exams with flat questions and the following question types:

- `true_false`
- `single_choice`
- `multiple_choice`
- `short_answer`
- `essay`

The 114 CEEC subject test papers show that this is not enough for a credible 分科測驗 workflow. The most common missing structure is not a new math-specific question type. It is:

1. question groups with shared stems and mixed child questions;
2. subjective answers that can contain math formulas without requiring students to learn LaTeX.

P0 therefore focuses on question grouping and a low-learning-cost Markdown/LaTeX answer editor. Drawing on charts, coordinate planes, physics arrows, and chemical structures remains out of scope for P0.

## Goals

- Support CEEC-style mixed question groups, such as one shared passage followed by single-choice and essay child questions.
- Keep each child question independently answered, autosaved, graded, and reported.
- Let students write math-rich subjective answers without learning raw LaTeX.
- Store answers in portable Markdown with LaTeX math syntax.
- Render the same Markdown answer consistently in answering, grading, result review, and AI grading flows.
- Preserve compatibility with existing flat `ExamQuestion` and `ExamAnswer` records.

## Non-Goals

- No freehand canvas as the primary answer format.
- No graph/diagram annotation in P0.
- No coordinate plane drawing, triangular diagram plotting, physics vector arrows, or chemical structure drawing in P0.
- No PDF-to-question auto-import in P0.
- No new dedicated `math_question` or `formula_question` type.

## Design Decision

Math formulas are an answer capability, not a question type.

Use existing subjective question types:

- `short_answer`
- `essay`

Add an answer format/configuration:

```json
{
  "answer_format": "markdown",
  "answer_capabilities": {
    "math": true
  }
}
```

This avoids a growing set of narrow question types such as `math_work`, `physics_work`, or `chemistry_work`. Math, physics, and chemistry subjective questions can all use the same Markdown answer model with different toolbar presets later.

## Backend Model

Add `ExamQuestionGroup`.

```text
ExamQuestionGroup
- id
- contest
- title
- shared_stem_markdown
- order
- created_at
- updated_at
```

Extend `ExamQuestion`.

```text
ExamQuestion
- group nullable FK -> ExamQuestionGroup
- order_in_group nullable integer
- answer_format default "plain_text"
- answer_capabilities JSON default {}
```

Existing flat questions keep `group = null` and continue to sort by `order`.

Child questions in a group still use the existing `ExamAnswer` model. A student's answer to a group is not stored as one large group-level answer. This keeps autosave, grading, regrading, and statistics aligned with the current per-question model.

## API Shape

Student question list should support grouped output while preserving compatibility.

Recommended response shape:

```json
[
  {
    "kind": "group",
    "id": "group-12-14",
    "title": "12-14 題為題組",
    "shared_stem_markdown": "...",
    "order": 12,
    "questions": [
      { "id": "q12", "question_type": "single_choice", "prompt": "...", "order_in_group": 1 },
      { "id": "q13", "question_type": "essay", "answer_format": "markdown", "answer_capabilities": { "math": true } },
      { "id": "q14", "question_type": "essay", "answer_format": "markdown", "answer_capabilities": { "math": true } }
    ]
  },
  {
    "kind": "question",
    "question": { "id": "q1", "question_type": "single_choice", "prompt": "..." }
  }
]
```

If the existing UI needs a flat list temporarily, the repository mapper can flatten groups into render sections without changing the backend contract again.

## Student Answer Format

Subjective Markdown math answers store as:

```json
{
  "text": "因為每次抽中的機率是 $\\frac{2}{5}$，\\n\\n$$E(X)=\\sum_{k=1}^{\\infty} k(\\frac{3}{5})^{k-1}\\frac{2}{5}=\\frac{5}{2}$$"
}
```

The `text` field remains the SSoT for subjective answers. This keeps compatibility with existing `essay` and `short_answer` handling while allowing math rendering.

## Student UI

Create a shared `MathMarkdownEditor` used by essay/short-answer inputs when `answer_capabilities.math === true`.

Required student behavior:

- Students can type normal Chinese text directly.
- Students can insert formulas through buttons and templates, without knowing LaTeX.
- The editor stores Markdown with LaTeX.
- The editor shows a live rendered preview or inline rendered math so students can verify formulas before submission.
- Keyboard-only operation must remain possible.
- Autosave behavior remains per question.

P0 toolbar presets:

- Fraction
- Square root
- Superscript
- Subscript
- Sigma
- Integral
- Limit
- Vector
- Parentheses/brackets
- Common symbols: `≤`, `≥`, `≠`, `±`, `∞`, `π`, `θ`, `λ`, `μ`, `Δ`
- Multi-line aligned derivation template

The UI should hide LaTeX complexity. Raw LaTeX can still be supported for advanced users, but it must not be required.

## Teacher Authoring

Add authoring support for:

- creating a question group;
- editing shared stem Markdown;
- adding/removing/reordering child questions;
- setting `answer_format = markdown`;
- toggling math capability for subjective questions.

Teachers should not be required to write JSON. The UI should expose "Enable math editor" as a normal setting for short-answer and essay questions.

## Grading

Grading screens must render grouped context:

- shared group stem;
- current child question prompt;
- student answer rendered as Markdown/KaTeX;
- raw answer text available when needed for debugging or AI review.

AI grading prompts must state:

- the student answer may contain Markdown and LaTeX;
- formulas should be interpreted semantically;
- the rubric should evaluate reasoning and final conclusion from the answer text, not from a separate final-answer field.

P0 does not require automatic extraction of final answers. That can be added later as an AI assist or grading-side derived field.

## Error Handling

- If a grouped question references a missing group, fall back to rendering it as a flat question and log the anomaly.
- If Markdown math rendering fails, show the original text and a non-blocking rendering warning.
- If a math editor component fails to load, fall back to a normal textarea with Markdown help hidden behind a small disclosure.
- Autosave failures continue using the existing local draft backup pattern.

## Architecture Placement

Backend:

- `backend/apps/contests/models.py`: `ExamQuestionGroup`, `ExamQuestion` fields.
- `backend/apps/contests/serializers.py`: grouped serializers and answer format fields.
- `backend/apps/contests/views/exam_question.py`: group-aware list/create/update endpoints.
- migrations under `backend/apps/contests/migrations/`.

Frontend:

- `frontend/src/core/entities/contest.entity.ts`: group and answer format entities.
- `frontend/src/infrastructure/api/dto/contest.dto.ts`: DTOs.
- `frontend/src/infrastructure/mappers/contest.mapper.ts`: group mapping.
- `frontend/src/infrastructure/api/repositories/examQuestions.repository.ts`: group-aware fetch and authoring calls.
- `frontend/src/shared/ui/markdown/`: reuse renderer behavior for display.
- `frontend/src/features/contest/components/exam/`: grouped runtime rendering.
- `frontend/src/features/contest/components/admin/examEditor/`: group authoring and math capability setting.

Shared UI:

- `MathMarkdownEditor` should live in `shared` only if it remains domain-neutral.
- It should not call APIs directly.
- Contest-specific answer wiring stays in `features/contest`.

## Testing

Backend tests:

- create/list/update/delete question groups;
- group ordering and child ordering;
- flat question compatibility;
- student serializer hides correct answers while including group context;
- answer submission still works per child question.

Frontend tests:

- mapper handles mixed grouped and flat response;
- grouped runtime renders shared stem once and child questions in order;
- autosave submits the correct child question answer;
- math-enabled subjective questions use `MathMarkdownEditor`;
- non-math subjective questions keep the current textarea behavior.

Visual/Storybook:

- `MathMarkdownEditor` playground.
- grouped question runtime story with CEEC-like 12-14 and 15-17 examples.
- all states: empty, editing, preview, render error fallback, disabled/read-only.

## Acceptance Criteria

- A teacher can create a CEEC-style group with shared stem and mixed child questions.
- A student can answer grouped questions without losing per-question autosave behavior.
- A student can enter common math formulas through UI controls without knowing LaTeX syntax.
- The stored answer is Markdown/LaTeX text.
- Grading and result pages render the same answer correctly.
- Existing non-grouped paper exams continue to work.
- No P0 implementation requires canvas or graph annotation.
