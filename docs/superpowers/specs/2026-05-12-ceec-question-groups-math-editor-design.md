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
- Keep the question type enum unchanged in P0.

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
  "answer_format": "markdown_math"
}
```

P0 uses a single enum field:

- `plain_text`: existing textarea behavior.
- `markdown`: Markdown rendering without the math editor.
- `markdown_math`: Markdown rendering plus the low-learning-cost math editor.

This avoids a growing set of narrow question types such as `math_work`, `physics_work`, or `chemistry_work`. It also avoids a drifting capabilities JSON before the product actually needs multiple independent answer capabilities. Drawing, chemistry structure editing, and other future capabilities can revisit a versioned capability schema later.

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

P0 scope decision: `ExamQuestionGroup` is contest-local only.

- It does not have `source_bank_id`.
- It does not point to `QuestionAsset` or `QuestionVersion`.
- `shared_stem_markdown` is stored directly on `ExamQuestionGroup`.

This intentionally postpones題庫 integration. Existing `ExamQuestion` already has `source_bank_id`, `question_asset`, and `question_version`; forcing group stems into the question-bank asset model in P0 would expand the migration and authoring scope. A later題庫 phase should decide whether a題組 becomes its own `QuestionAsset` type or a container over multiple assets.

Extend `ExamQuestion`.

```text
ExamQuestion
- group nullable FK -> ExamQuestionGroup
- order_in_group nullable integer
- answer_format default "plain_text"
```

Existing flat questions keep `group = null` and continue to sort by `order`.

Existing `essay` and `short_answer` questions are not batch-upgraded. They remain `answer_format = "plain_text"` unless a teacher explicitly enables Markdown or Markdown math in the editor. This avoids changing rendering behavior for existing exams.

Child questions in a group still use the existing `ExamAnswer` model. A student's answer to a group is not stored as one large group-level answer. This keeps autosave, grading, regrading, and statistics aligned with the current per-question model.

Question groups do not store cached scores in P0. Group total score is computed as the sum of child question scores by backend serializers. There is no persisted group subtotal field.

## Ordering Semantics

P0 uses `ExamQuestion.order` as the whole-paper canonical ordering key.

- `ExamQuestion.order` remains unique within a contest and drives navigation index, autosave ordering, anti-cheat snapshots, and student progress.
- Questions inside a group must occupy a contiguous `ExamQuestion.order` range.
- `ExamQuestionGroup.order` points to the group's placement in the whole paper and must equal the first child question's `order` for publishable groups.
- `order_in_group` is a display and authoring convenience for child ordering within the group. It does not replace `ExamQuestion.order`.
- Reordering a group updates `ExamQuestionGroup.order` and all child `ExamQuestion.order` values in one transaction.
- Reordering children within a group updates `order_in_group` and the affected contiguous `ExamQuestion.order` values in one transaction.

This keeps existing flat-question consumers simple: code that only knows about `ExamQuestion.order` still sees the same paper order.

## API Shape

Student exam start/runtime should fetch a complete paper snapshot through one composite endpoint:

```text
GET /api/v1/contests/{contest_id}/exam-paper/
```

Response shape:

```json
{
  "questions": [
    {
      "id": "q12",
      "question_type": "single_choice",
      "prompt": "...",
      "order": 12,
      "group_id": "group-12-14",
      "order_in_group": 1,
      "answer_format": "plain_text"
    },
    {
      "id": "q13",
      "question_type": "essay",
      "prompt": "...",
      "order": 13,
      "group_id": "group-12-14",
      "order_in_group": 2,
      "answer_format": "markdown_math"
    }
  ],
  "groups": [
    {
      "id": "group-12-14",
      "title": "12-14 題為題組",
      "shared_stem_markdown": "...",
      "order": 12,
      "total_score": 12
    }
  ]
}
```

This avoids races where student runtime fetches questions and groups from different edit states. It also matches the product model: starting an exam loads one paper snapshot.

`total_score` is computed by the backend serializer as the immediate sum of child `ExamQuestion.score` values. Frontend view models display this value; they do not recompute group totals.

Teacher/admin editing endpoints remain split for targeted CRUD and incremental editing.

`GET /api/v1/contests/{contest_id}/exam-questions/` continues returning a flat `ExamQuestionDto[]`. Each question may include nullable group metadata:

```json
[
  {
    "id": "q12",
    "question_type": "single_choice",
    "prompt": "...",
    "order": 12,
    "group_id": "group-12-14",
    "order_in_group": 1,
    "answer_format": "plain_text"
  },
  {
    "id": "q13",
    "question_type": "essay",
    "prompt": "...",
    "order": 13,
    "group_id": "group-12-14",
    "order_in_group": 2,
    "answer_format": "markdown_math"
  }
]
```

Group definitions are returned through a separate group index endpoint:

```json
[
  {
    "id": "group-12-14",
    "title": "12-14 題為題組",
    "shared_stem_markdown": "...",
    "order": 12,
    "total_score": 12
  }
]
```

Recommended endpoint:

```text
GET /api/v1/contests/{contest_id}/exam-question-groups/
```

The frontend repository can join the flat question list with the group index to render grouped sections for admin/editor screens. Existing components that consume `ExamQuestion[]`, autosave by question id, question navigation, and anti-cheat snapshots can continue to operate on the flat list.

## Navigation and Anti-Cheat

Question groups are a presentation and authoring structure in P0. They do not introduce group-level exam events.

- Focus loss and visibility events remain exam/session-level anti-cheat events.
- Question navigation remains question-based.
- Moving between child questions in the same group is not a special anti-cheat event.
- Leaving the last child of a group for another group is normal question navigation, not focus loss.
- Existing anti-cheat snapshots can continue referencing question ids. Group context can be derived later by joining with the group index.

## Student Answer Format

Subjective Markdown math answers store as:

```json
{
  "text": "因為每次抽中的機率是 $\\frac{2}{5}$，\\n\\n$$E(X)=\\sum_{k=1}^{\\infty} k(\\frac{3}{5})^{k-1}\\frac{2}{5}=\\frac{5}{2}$$"
}
```

The `text` field remains the SSoT for subjective answers. This keeps compatibility with existing `essay` and `short_answer` handling while allowing math rendering.

Subjective `text` is capped at 32 KB in P0. Backend rejects oversized answers with a validation error. Student runtime keeps the local draft so the student can trim the answer and retry instead of losing work.

`shared_stem_markdown` always renders with Markdown + KaTeX support, using the same renderer pipeline as `markdown_math` answers. A grouped math stem must not render differently from a math-enabled answer.

## Student UI

Create a shared `MathMarkdownEditor` used by essay/short-answer inputs when `answer_format === "markdown_math"`.

Required student behavior:

- Students can type normal Chinese text directly.
- Students can insert formulas through buttons and templates, without knowing LaTeX.
- The editor stores Markdown with LaTeX.
- The editor renders math inline, similar to Notion-style editing, so students do not need to compare a separate preview pane during an exam.
- Keyboard-only operation must remain possible.
- Autosave behavior remains per question.
- Paste from Word, PDF, or external web pages is sanitized to plain text in P0. P0 does not attempt to convert pasted equation objects into LaTeX. Math formulas should be created through the editor controls or typed directly by advanced users.

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

All toolbar labels, aria labels, and tooltips must use i18n keys. The implementation acceptance gate includes `npm run check:i18n`.

## Teacher Authoring

Add authoring support for:

- creating a question group;
- editing shared stem Markdown;
- adding/removing/reordering child questions;
- setting `answer_format` to `plain_text`, `markdown`, or `markdown_math`;
- enabling the math editor for subjective questions by selecting `markdown_math`.
- moving a whole question group within the paper. The backend updates `ExamQuestionGroup.order` and every child `ExamQuestion.order` in a single transaction.

Teachers should not be required to write JSON. The UI should expose "Enable math editor" as a normal setting for short-answer and essay questions.

## Grading

Grading screens must render grouped context:

- shared group stem;
- current child question prompt;
- student answer rendered as Markdown/KaTeX;
- raw answer text available when needed for debugging or AI review.
- computed group total score and per-child score breakdown.

AI grading prompts must state:

- the student answer may contain Markdown and LaTeX;
- formulas should be interpreted semantically;
- Markdown decoration such as headings, lists, and emphasis should be ignored unless the rubric explicitly cares about formatting;
- if math rendering fails, the raw answer text and original LaTeX should still be used for evaluation;
- the rubric should evaluate reasoning and final conclusion from the answer text, not from a separate final-answer field.

P0 does not require automatic extraction of final answers. That can be added later as an AI assist or grading-side derived field.

## Error Handling

- If a student runtime sees a question with a missing group reference, fall back to rendering it as a flat question and emit a backend/frontend anomaly log without interrupting the exam.
- If admin or teacher authoring sees a question with a missing group reference, show a visible "question group binding error" state and block saving until the binding is repaired or removed.
- If Markdown math rendering fails, show the original text and a non-blocking rendering warning.
- If a math editor component fails to load, fall back to a normal textarea with Markdown help hidden behind a small disclosure.
- Autosave failures continue using the existing local draft backup pattern.

## Architecture Placement

Backend:

- `backend/apps/contests/models.py`: `ExamQuestionGroup`, `ExamQuestion` fields.
- `backend/apps/contests/serializers.py`: grouped serializers and answer format fields.
- `backend/apps/contests/views/exam_question.py`: flat question list with nullable group fields.
- `backend/apps/contests/views/exam_question_group.py`: group index and authoring endpoints.
- `backend/apps/contests/views/exam_paper.py`: composite student paper endpoint returning `{ questions, groups }`.
- migrations under `backend/apps/contests/migrations/`.

Frontend:

- `frontend/src/core/entities/contest.entity.ts`: group and answer format entities.
- `frontend/src/infrastructure/api/dto/contest.dto.ts`: DTOs.
- `frontend/src/infrastructure/mappers/contest.mapper.ts`: group mapping.
- `frontend/src/infrastructure/api/repositories/examPaper.repository.ts`: composite student paper fetch.
- `frontend/src/infrastructure/api/repositories/examQuestions.repository.ts`: flat question fetch and authoring calls.
- `frontend/src/infrastructure/api/repositories/examQuestionGroups.repository.ts`: group index and authoring calls.
- `frontend/src/shared/ui/markdown/`: reuse renderer behavior for display.
- `frontend/src/shared/ui/editor/MathMarkdownEditor/`: domain-neutral Markdown math editor.
- `frontend/src/features/contest/components/exam/`: grouped runtime rendering.
- `frontend/src/features/contest/components/admin/examEditor/`: group authoring and answer format setting.

Frontend grouped runtime view model:

```ts
type ExamPaperSection =
  | { kind: "group"; group: ExamQuestionGroup; items: ExamQuestion[] }
  | { kind: "flat"; item: ExamQuestion };
```

`ExamPaperSection` is produced in the contest feature layer after infrastructure mappers return core `ExamQuestion` and `ExamQuestionGroup` entities. Storybook fixtures and runtime components should use this same contract.

Shared UI:

- `MathMarkdownEditor` should live under `shared/ui/editor/MathMarkdownEditor/` only if it remains domain-neutral.
- It should not call APIs directly and should only expose `value`, `onChange`, disabled/read-only state, paste behavior, and editor UI events.
- Debounce, local draft backup, and autosave remain in `features/contest` hooks that wrap the editor.
- Contest-specific answer wiring stays in `features/contest`.

## Testing

Backend tests:

- create/list/update/delete question groups;
- group ordering and child ordering;
- group reorder updates `ExamQuestionGroup.order` and contiguous child `ExamQuestion.order` in one transaction;
- flat question compatibility;
- student serializer hides correct answers while including group context;
- answer submission still works per child question.
- answer format validation accepts only `plain_text`, `markdown`, and `markdown_math`.
- migration keeps existing `essay` and `short_answer` rows as `plain_text`.
- oversize subjective answers over 32 KB are rejected without corrupting existing answers.
- composite `exam-paper` endpoint returns questions and groups from one consistent snapshot.
- guard test confirms `ExamQuestionType.choices` remains the existing five values in P0.

Frontend tests:

- student runtime consumes the composite `{ questions, groups }` paper response;
- mapper joins flat question list with group index;
- mapper produces the `ExamPaperSection` contract;
- grouped runtime renders shared stem once and child questions in order;
- grouped runtime renders shared stems with Markdown + KaTeX;
- autosave submits the correct child question answer;
- math-enabled subjective questions use `MathMarkdownEditor`;
- non-math subjective questions keep the current textarea behavior.
- paste into `MathMarkdownEditor` degrades to sanitized plain text.
- toolbar labels are i18n-backed and `npm run check:i18n` passes.
- a grouped paper produces the same anti-cheat event count as a flat paper with the same number of questions under equivalent navigation/focus behavior.

Visual/Storybook:

- `MathMarkdownEditor` playground.
- grouped question runtime story with CEEC-like 12-14 and 15-17 examples using flat questions plus group index fixtures.
- all states: empty, editing with inline math rendering, render error fallback, disabled/read-only.

## Acceptance Criteria

- A teacher can create a CEEC-style group with shared stem and mixed child questions.
- A student can answer grouped questions without losing per-question autosave behavior.
- A student can enter common math formulas through UI controls without knowing LaTeX syntax.
- The stored answer is Markdown/LaTeX text.
- Grading and result pages render the same answer correctly.
- Student runtime and result pages show computed group total score consistently.
- Teacher grading can navigate grouped child questions without losing group context.
- Existing non-grouped paper exams continue to work.
- A grouped paper does not produce extra anti-cheat events compared with a flat paper of the same question count under equivalent navigation/focus behavior.
- No P0 implementation requires canvas or graph annotation.
- No P0 implementation adds a new `ExamQuestionType`.
- i18n checks pass for editor toolbar labels and tooltips.
