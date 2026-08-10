# Remove Exam Answer Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `ExamAnswer.question_snapshot`, make the live `ExamQuestion` the only display and grading source, and replace auto-save with explicit grading updates after an exam is locked.

**Architecture:** Contest lifecycle owns the permanent content lock. A focused backend service owns locked grading updates and validates the transient `existing_grades_action` command inside one transaction. The frontend keeps current auto-save before lock, but after lock it freezes content fields and uses an explicit Carbon confirmation flow for grading fields.

**Tech Stack:** Django 4.2, Django REST Framework, PostgreSQL, React, TypeScript, Carbon React, pytest, Vitest, Docker Compose.

## Global Constraints

- Do not add audit tables, grading versions, `needs_regrade`, or replacement snapshots.
- The first participant entering `IN_PROGRESS` permanently locks prompt, options, type, order, group placement, and answer format.
- Locked grading edits never auto-save and require `regrade`, `keep`, or `mark_pending`.
- `mark_pending` clears score/correctness/grader/timestamp, preserves feedback, recalculates totals, and unpublishes results.
- `regrade` uses the current question, recalculates totals, and unpublishes results.
- Subjective `keep` preserves existing grades and publication state.
- Score-policy changes preserve raw answer scores, recalculate totals, and unpublish results.
- Run Django, pytest, npm, and MCP commands through `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh`.
- Preserve unrelated dirty-worktree changes; every commit stages explicit paths only.

## File Structure

- `backend/apps/contests/services/locked_question_update.py`: locked grading command validation and transaction.
- `backend/apps/contests/services/question_edit_lock.py`: permanent content-lock policy.
- `frontend/src/features/contest/components/admin/examEditor/lockedQuestionSaveImpact.ts`: pure UI impact classifier.
- `frontend/src/features/contest/components/admin/examEditor/LockedGradingSaveModal.tsx`: objective/subjective confirmation UI.
- Existing infrastructure repositories remain the only frontend HTTP boundary.

---

### Task 1: Remove the backend snapshot and use live questions everywhere

**Files:**
- Create: `backend/apps/contests/migrations/0093_remove_examanswer_question_snapshot.py`
- Modify: `backend/apps/contests/models/answers.py`
- Modify: `backend/apps/contests/models/questions.py`
- Modify: `backend/apps/contests/views/exam_answer.py`
- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/services/participant_dashboard.py`
- Modify: `backend/apps/contests/exporters/renderers/paper_exam_report.py`
- Test: `backend/apps/contests/tests/exam/test_exam_answers.py`
- Test: `backend/apps/contests/tests/test_participant_dashboard_api.py`
- Test: `backend/apps/contests/tests/exporters/test_student_report.py`

**Interfaces:**
- Consumes: `ExamAnswer.question: ForeignKey[ExamQuestion]`.
- Produces: `ExamAnswer.auto_grade() -> None` using only `self.question`; answer-detail API without `question_snapshot`.

- [ ] **Step 1: Write failing live-question tests**

Add to `test_exam_answers.py`:

```python
def test_auto_grade_uses_current_question_rules(self):
    self.client.force_authenticate(user=self.student)
    response = self.client.post(
        self._url(),
        {"question_id": self.q_single.id, "answer": {"selected": "B"}},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    answer = ExamAnswer.objects.get(
        participant=self.participant, question=self.q_single
    )
    self.q_single.correct_answer = "A"
    self.q_single.score = 7
    self.q_single.save(update_fields=["correct_answer", "score"])
    answer.auto_grade()
    assert answer.is_correct is False
    assert answer.score == 0


def test_submit_model_has_no_question_snapshot(self):
    self.client.force_authenticate(user=self.student)
    response = self.client.post(
        self._url(),
        {"question_id": self.q_essay.id, "answer": {"text": "response"}},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    assert "question_snapshot" not in {
        field.name for field in ExamAnswer._meta.get_fields()
    }
```

Replace the existing snapshot-explanation assertion with a results test that changes `question.explanation` after answer creation and expects the new explanation. Add the same current-question expectation to dashboard and student-report tests.

- [ ] **Step 2: Verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests/exam/test_exam_answers.py \
  apps/contests/tests/test_participant_dashboard_api.py \
  apps/contests/tests/exporters/test_student_report.py
```

Expected: FAIL because the model and readers still prefer snapshot data.

- [ ] **Step 3: Remove snapshot persistence and grading fallback**

In `answers.py`, delete the field and start `auto_grade()` with:

```python
def auto_grade(self):
    q_type = self.question.question_type
    correct = self.question.correct_answer
    q_score = self.question.score
    if correct is None:
        return
    if q_type in (ExamQuestionType.TRUE_FALSE, ExamQuestionType.SINGLE_CHOICE):
        self.is_correct = self.answer.get("selected") == correct
        self.score = q_score if self.is_correct else 0
    elif q_type == ExamQuestionType.MULTIPLE_CHOICE:
        selected = set(self.answer.get("selected", []))
        correct_set = set(correct) if isinstance(correct, list) else set()
        self.is_correct = selected == correct_set
        self.score = q_score if self.is_correct else 0
```

Delete `ExamQuestion.to_snapshot()` and the `created` branch assigning it in `submit_answer()`.

- [ ] **Step 4: Remove snapshot fields and reader fallbacks**

Remove `question_snapshot` from `ExamAnswerDetailSerializer`. Its methods become direct reads:

```python
def get_question_prompt(self, obj):
    return obj.question.prompt

def get_question_type(self, obj):
    return obj.question.question_type

def get_question_explanation(self, obj):
    return obj.question.explanation

def get_max_score(self, obj):
    return obj.question.score

def get_question_options(self, obj):
    return obj.question.options
```

Replace dashboard/report snapshot lookups with current `question` fields and delete `_get_snapshot_value()`.

- [ ] **Step 5: Generate and apply the migration**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  python manage.py makemigrations contests --name remove_examanswer_question_snapshot
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py migrate
```

Expected: migration `0093` contains only `RemoveField(examanswer, question_snapshot)` and depends on `0092_remove_legacy_anticheat_fields`.

- [ ] **Step 6: Verify GREEN and commit**

Run the Step 2 tests again. Then:

```bash
git add backend/apps/contests/migrations/0093_remove_examanswer_question_snapshot.py \
  backend/apps/contests/models/answers.py backend/apps/contests/models/questions.py \
  backend/apps/contests/views/exam_answer.py backend/apps/contests/serializers.py \
  backend/apps/contests/services/participant_dashboard.py \
  backend/apps/contests/exporters/renderers/paper_exam_report.py \
  backend/apps/contests/tests/exam/test_exam_answers.py \
  backend/apps/contests/tests/test_participant_dashboard_api.py \
  backend/apps/contests/tests/exporters/test_student_report.py
git commit -m "refactor(contests): remove exam answer snapshots"
```

---

### Task 2: Lock exam content when the first participant starts

**Files:**
- Create: `backend/apps/contests/migrations/0094_add_exam_started_question_lock_trigger.py`
- Modify: `backend/apps/contests/models/contest.py`
- Modify: `backend/apps/contests/services/question_edit_lock.py`
- Modify: `backend/apps/contests/views/exam_lifecycle.py`
- Test: `backend/apps/contests/tests/exam/test_exam_state.py`
- Test: `backend/apps/contests/tests/exam/test_exam_questions_api.py`

**Interfaces:**
- Produces: `Contest.QuestionEditLockTrigger.EXAM_STARTED`; `contest_has_started(contest) -> bool`.

- [ ] **Step 1: Write failing start-lock tests**

```python
def test_start_exam_locks_question_content(self):
    response = self.client.post(
        reverse("contests:contest-exam-start-exam", args=[self.contest.id])
    )
    assert response.status_code == status.HTTP_200_OK
    self.contest.refresh_from_db()
    assert self.contest.question_edit_locked is True
    assert self.contest.question_edit_lock_trigger == "exam_started"
```

Also create an `IN_PROGRESS` participant while the legacy lock boolean is false and assert create/delete/reorder endpoints still return `409`.

- [ ] **Step 2: Verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests/exam/test_exam_state.py \
  apps/contests/tests/exam/test_exam_questions_api.py::TestQuestionEditLockGuard
```

Expected: FAIL because start does not lock and the guard checks only the boolean.

- [ ] **Step 3: Implement trigger and defensive state check**

```python
class QuestionEditLockTrigger(models.TextChoices):
    CODING_SUBMISSION = "coding_submission", "Coding Submission"
    EXAM_ANSWER = "exam_answer", "Exam Answer"
    EXAM_STARTED = "exam_started", "Exam Started"


LOCKING_EXAM_STATUSES = (
    ExamStatus.IN_PROGRESS,
    ExamStatus.PAUSED,
    ExamStatus.LOCKED,
    ExamStatus.SUBMITTED,
)

def contest_has_started(contest: Contest) -> bool:
    return contest.registrations.filter(
        exam_status__in=LOCKING_EXAM_STATUSES,
    ).exists()
```

Make `ensure_contest_question_editable()` block when either the boolean or `contest_has_started()` is true.

- [ ] **Step 4: Make start and lock atomic**

Wrap transitions to `IN_PROGRESS` in `transaction.atomic()`, lock the contest and participant rows, save the participant, then call:

```python
lock_contest_question_editing(
    contest=contest,
    trigger=Contest.QuestionEditLockTrigger.EXAM_STARTED,
    actor_id=request.user.id,
)
```

Call it idempotently for first start, resume, and allowed re-entry.

- [ ] **Step 5: Generate migration, verify GREEN, and commit**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  python manage.py makemigrations contests --name add_exam_started_question_lock_trigger
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py migrate
```

Run Step 2 again, then:

```bash
git add backend/apps/contests/migrations/0094_add_exam_started_question_lock_trigger.py \
  backend/apps/contests/models/contest.py \
  backend/apps/contests/services/question_edit_lock.py \
  backend/apps/contests/views/exam_lifecycle.py \
  backend/apps/contests/tests/exam/test_exam_state.py \
  backend/apps/contests/tests/exam/test_exam_questions_api.py
git commit -m "feat(contests): lock exam content when answering starts"
```

---

### Task 3: Add the atomic locked-grading update command

**Files:**
- Create: `backend/apps/contests/services/locked_question_update.py`
- Create: `backend/apps/contests/tests/exam/test_locked_question_update.py`
- Modify: `backend/apps/contests/services/__init__.py`
- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/views/exam_question.py`
- Modify: `backend/apps/contests/views/exam_paper.py`

**Interfaces:**
- Produces: `ExistingGradesAction = Literal["regrade", "keep", "mark_pending"]` and `apply_locked_question_update(*, question, validated_data, action) -> LockedQuestionUpdateResult`.

- [ ] **Step 1: Write failing command-matrix tests**

Create fixtures for a locked contest, teacher, two participants, an objective question, an essay, and graded answers. Cover:

```python
def test_objective_change_rejects_keep(api_client, locked_exam):
    response = api_client.patch(
        locked_exam.objective_url,
        {"correct_answer": 1, "existing_grades_action": "keep"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_regrade_uses_live_rule_and_unpublishes(api_client, locked_exam):
    response = api_client.patch(
        locked_exam.objective_url,
        {"correct_answer": 1, "existing_grades_action": "regrade"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    locked_exam.answer.refresh_from_db()
    locked_exam.contest.refresh_from_db()
    assert locked_exam.answer.is_correct is True
    assert locked_exam.contest.results_published is False


def test_mark_pending_preserves_feedback(api_client, locked_essay):
    response = api_client.patch(
        locked_essay.question_url,
        {"correct_answer": "new rubric", "existing_grades_action": "mark_pending"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    locked_essay.answer.refresh_from_db()
    assert locked_essay.answer.score is None
    assert locked_essay.answer.graded_by_id is None
    assert locked_essay.answer.graded_at is None
    assert locked_essay.answer.feedback == "useful old feedback"
```

Also test subjective `keep`, explanation-only `keep`, policy recalculation, prompt change `409`, identical full content plus grading delta, rollback on forced scoring failure, and the nested exam-paper route.

- [ ] **Step 2: Verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/exam/test_locked_question_update.py
```

Expected: FAIL because all locked updates currently return `409`.

- [ ] **Step 3: Add the transient serializer command**

```python
existing_grades_action = serializers.ChoiceField(
    choices=("regrade", "keep", "mark_pending"),
    required=False,
    write_only=True,
)
```

Add it to `ExamQuestionSerializer.fields`; pop it from `validated_data` before any model save.

- [ ] **Step 4: Implement service types and field classification**

```python
ExistingGradesAction = Literal["regrade", "keep", "mark_pending"]
CONTENT_FIELDS = frozenset({
    "prompt", "options", "question_type", "order",
    "group_id", "order_in_group", "answer_format",
})
OBJECTIVE_REGRADING_FIELDS = frozenset({"correct_answer", "score"})
SUBJECTIVE_REVIEW_FIELDS = frozenset({
    "correct_answer", "reference_answer_document", "score",
})
POLICY_FIELDS = frozenset({"score_policy", "score_policy_config"})
EXPLANATION_FIELDS = frozenset({"explanation", "explanation_document"})

@dataclass(frozen=True)
class LockedQuestionUpdateResult:
    question: ExamQuestion
    affected_answers: int
    results_unpublished: bool
```

Compare only validated keys and normalized values. Reject actual content changes; identical content values must not block grading edits.

- [ ] **Step 5: Implement the transaction**

```python
@transaction.atomic
def apply_locked_question_update(*, question, validated_data, action):
    contest = Contest.objects.select_for_update().get(pk=question.contest_id)
    locked_question = ExamQuestion.objects.select_for_update().get(pk=question.pk)
    answers = list(
        ExamAnswer.objects.select_for_update()
        .filter(question=locked_question)
        .select_related("participant", "question")
    )

    changes = {
        name for name, value in validated_data.items()
        if getattr(locked_question, name) != value
    }
    if changes & CONTENT_FIELDS:
        raise ContestQuestionEditLocked()
    if not changes:
        return LockedQuestionUpdateResult(locked_question, 0, False)

    objective = locked_question.question_type in (
        ExamQuestionType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE,
        ExamQuestionType.MULTIPLE_CHOICE,
    )
    objective_impact = objective and bool(changes & OBJECTIVE_REGRADING_FIELDS)
    subjective_impact = not objective and bool(changes & SUBJECTIVE_REVIEW_FIELDS)
    policy_impact = bool(changes & POLICY_FIELDS)
    allowed_actions = (
        {"regrade"} if objective_impact
        else {"keep", "mark_pending"} if subjective_impact
        else {"keep"}
    )
    if action not in allowed_actions:
        raise DRFValidationError({
            "existing_grades_action": "action does not match the locked change",
        })

    for name, value in validated_data.items():
        setattr(locked_question, name, value)
    locked_question.save(update_fields=[*changes, "updated_at"])

    affected = 0
    now = timezone.now()
    if action == "regrade":
        for answer in answers:
            answer.question = locked_question
            answer.auto_grade()
            answer.updated_at = now
        ExamAnswer.objects.bulk_update(
            answers, ["score", "is_correct", "updated_at"]
        )
        affected = len(answers)
    elif action == "mark_pending":
        graded = [answer for answer in answers if answer.score is not None]
        for answer in graded:
            answer.score = None
            answer.is_correct = None
            answer.graded_by = None
            answer.graded_at = None
            answer.updated_at = now
        ExamAnswer.objects.bulk_update(
            graded,
            ["score", "is_correct", "graded_by", "graded_at", "updated_at"],
        )
        affected = len(graded)

    changes_scores = action in {"regrade", "mark_pending"} or policy_impact
    if changes_scores:
        ExamScoringService(contest).recalculate_all()
    results_unpublished = changes_scores and contest.results_published
    if results_unpublished:
        contest.results_published = False
        contest.save(update_fields=["results_published", "updated_at"])

    transaction.on_commit(lambda: cache.delete(
        f"contest:{contest.id}:exam_question_detail:{locked_question.id}:v2"
    ))
    return LockedQuestionUpdateResult(
        question=locked_question,
        affected_answers=affected,
        results_unpublished=results_unpublished,
    )
```

Import `ValidationError as DRFValidationError` from `rest_framework.exceptions`. For `regrade`, call `auto_grade()` and bulk-update score/correctness. For `mark_pending`, clear score, correctness, grader, and graded time only on graded rows; preserve feedback. For policy changes, preserve raw scores and call `ExamScoringService(contest).recalculate_all()`. Register an `on_commit` cache delete for `contest:{contest_id}:exam_question_detail:{question_id}:v2`.

- [ ] **Step 6: Route both update endpoints through the service**

Replace `score_policy_only` in `exam_question.py` and the unconditional update guard in the question branch of `exam_paper.py` with the common service. Keep create/delete/reorder/group mutations on strict `ensure_contest_question_editable()`.

```python
action = serializer.validated_data.pop("existing_grades_action", None)
if contest.question_edit_locked or contest_has_started(contest):
    result = apply_locked_question_update(
        question=serializer.instance,
        validated_data=dict(serializer.validated_data),
        action=action,
    )
    serializer.instance = result.question
else:
    serializer.save()
```

- [ ] **Step 7: Verify GREEN and commit**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests/exam/test_locked_question_update.py \
  apps/contests/tests/exam/test_exam_questions_api.py \
  apps/contests/tests/test_score_policy.py
git add backend/apps/contests/services/locked_question_update.py \
  backend/apps/contests/services/__init__.py backend/apps/contests/serializers.py \
  backend/apps/contests/views/exam_question.py backend/apps/contests/views/exam_paper.py \
  backend/apps/contests/tests/exam/test_locked_question_update.py
git commit -m "feat(contests): support explicit locked grading updates"
```

---

### Task 4: Remove frontend snapshot contracts and result fallbacks

**Files:**
- Create: `frontend/src/infrastructure/api/repositories/examAnswers.repository.test.ts`
- Modify: `frontend/src/infrastructure/api/repositories/examAnswers.repository.ts`
- Modify: `frontend/src/features/contest/components/exam/PaperExamResultsList.tsx`
- Modify: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.tsx`
- Modify: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx`

**Interfaces:**
- Produces: `ExamAnswerDetail` without `questionSnapshot`; result UI using current questions.

- [ ] **Step 1: Write failing mapper/rendering tests**

```typescript
const results = await getExamResults("contest-1");
expect(results[0]).toMatchObject({
  questionId: "question-1",
  questionPrompt: "Current prompt",
  questionExplanation: "Current explanation",
});
expect(results[0]).not.toHaveProperty("questionSnapshot");
```

In the dashboard test, supply current question text plus a conflicting legacy raw `question_snapshot`; assert only current question data renders.

- [ ] **Step 2: Verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- \
  src/infrastructure/api/repositories/examAnswers.repository.test.ts \
  src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx
```

- [ ] **Step 3: Remove DTO/domain snapshot types and mapper output**

Delete `QuestionSnapshotDto`, `QuestionSnapshot`, `question_snapshot`, and `questionSnapshot`. Keep flattened fields:

```typescript
export interface ExamAnswerDetail extends ExamAnswer {
  isCorrect: boolean | null;
  score: number | null;
  feedback: string;
  questionPrompt?: string;
  questionType?: string;
  questionOptions?: string[];
  questionExplanation?: string;
  maxScore?: number | null;
}
```

- [ ] **Step 4: Remove component fallbacks**

Use `question.prompt`, `question.questionType`, `question.score`, `question.options`, `question.correctAnswer`, `question.referenceAnswerDocument`, and `question.explanationDocument` directly. Use `result.questionExplanation ?? question.explanation` only for the flattened explanation field intentionally returned by the answer-detail API.

- [ ] **Step 5: Verify GREEN, build, and commit**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- \
  src/infrastructure/api/repositories/examAnswers.repository.test.ts \
  src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
git add frontend/src/infrastructure/api/repositories/examAnswers.repository.ts \
  frontend/src/infrastructure/api/repositories/examAnswers.repository.test.ts \
  frontend/src/features/contest/components/exam/PaperExamResultsList.tsx \
  frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.tsx \
  frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx
git commit -m "refactor(frontend): remove exam answer snapshot fallbacks"
```

---

### Task 5: Implement locked explicit-save editing

**Files:**
- Create: `frontend/src/features/contest/components/admin/examEditor/lockedQuestionSaveImpact.ts`
- Create: `frontend/src/features/contest/components/admin/examEditor/lockedQuestionSaveImpact.test.ts`
- Create: `frontend/src/features/contest/components/admin/examEditor/LockedGradingSaveModal.tsx`
- Create: `frontend/src/features/contest/components/admin/examEditor/LockedGradingSaveModal.test.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.test.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.module.scss`
- Modify: `frontend/src/features/contest/components/admin/examEditor/ExamEditorLayout.tsx`
- Modify: `frontend/src/infrastructure/api/repositories/examPaper.repository.ts`
- Modify: `frontend/src/infrastructure/api/repositories/examPaper.repository.test.ts`
- Modify: `frontend/src/infrastructure/api/repositories/examQuestions.repository.ts`
- Modify: `frontend/src/features/contest/screens/settings/grading/components/ScorePolicyMenu.tsx`
- Modify: `frontend/src/i18n/locales/{en,ja,ko,zh-TW}/contest.json`

**Interfaces:**
- Produces: `ExistingGradesAction`; `classifyLockedQuestionSave(before: LockedQuestionComparableState, after: LockedQuestionComparableState, gradedAnswerCount: number) -> LockedSaveImpact`; card save callback with optional action.

- [ ] **Step 1: Write failing classifier tests**

```typescript
expect(classifyLockedQuestionSave(objectiveBefore, objectiveAfter, 18))
  .toEqual({ kind: "objective-regrade", affectedCount: 18 });
expect(classifyLockedQuestionSave(essayBefore, essayAfter, 7))
  .toEqual({ kind: "subjective-review", affectedCount: 7 });
expect(classifyLockedQuestionSave(essayBefore, explanationOnly, 7))
  .toEqual({ kind: "display-only", affectedCount: 0 });
```

- [ ] **Step 2: Verify RED, then implement classifier and repository types**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- \
  src/features/contest/components/admin/examEditor/lockedQuestionSaveImpact.test.ts
```

Implement:

```typescript
export type ExistingGradesAction = "regrade" | "keep" | "mark_pending";
export type LockedSaveImpact =
  | { kind: "objective-regrade"; affectedCount: number }
  | { kind: "subjective-review"; affectedCount: number }
  | { kind: "display-only"; affectedCount: 0 }
  | { kind: "no-op"; affectedCount: 0 };
```

Define and export `LockedQuestionComparableState` in the same pure module with the form fields used for classification (`questionType`, `score`, answer selections, reference answer/document, explanation/document). `QuestionFormState` in the card must satisfy that interface. Add optional `existing_grades_action` to question update payloads. Make `setExamQuestionScorePolicy()` send `keep` after its existing impact confirmation.

- [ ] **Step 3: Write failing modal and locked-card tests**

Test that objective modal exposes cancel/regrade, subjective modal exposes cancel/keep/mark-pending, and:

```typescript
it("does not auto-save a locked grading edit", async () => {
  const onAutoSave = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <ExamQuestionEditCard
      question={createQuestion({ questionType: "essay", correctAnswer: "old rubric" })}
      index={0}
      contentLocked
      gradedAnswerCount={3}
      onAutoSave={onAutoSave}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
    />,
  );
  await user.click(screen.getByTestId("exam-card-q1"));
  const reference = screen.getByLabelText("評分參考答案");
  await user.clear(reference);
  await user.type(reference, "new rubric");
  await vi.advanceTimersByTimeAsync(1500);
  fireEvent.blur(reference);
  expect(onAutoSave).not.toHaveBeenCalled();
  expect(screen.getByText(/尚未儲存/)).toBeInTheDocument();
});
```

Add `data-testid={\`exam-card-${question.id}\`}` to the card root as part of the implementation. Also assert choosing mark-pending calls `onAutoSave(payload, "q1", "mark_pending")` exactly once.

- [ ] **Step 4: Implement the Carbon modal**

Use `ComposedModal`, `ModalHeader`, `ModalBody`, and `ModalFooter` for three actions:

```typescript
interface LockedGradingSaveModalProps {
  open: boolean;
  impact: LockedSaveImpact;
  resultsPublished: boolean;
  submitting: boolean;
  onCancel: () => void;
  onChoose: (action: ExistingGradesAction) => void;
}
```

Use Carbon tokens; do not override `.cds--*` or use `!important`.

- [ ] **Step 5: Split full read-only from content lock**

Keep `frozen` for fully read-only consumers. Add:

```typescript
interface ExamQuestionEditCardProps {
  frozen?: boolean;
  contentLocked?: boolean;
  gradedAnswerCount?: number;
  resultsPublished?: boolean;
  onAutoSave: (
    payload: ExamQuestionUpsertPayload,
    questionId?: string,
    action?: ExistingGradesAction,
  ) => Promise<void>;
}
```

When `contentLocked`, allow edit mode; disable prompt/type/options/answer format but enable correct answer/reference/score/explanation. Do not schedule debounce or blur-save. Show dirty state and `儲存變更`; closing dirty state offers continue or discard.

- [ ] **Step 6: Wire the layout and API action**

Pass `contentLocked={contest.questionEditLocked}`, graded count, and `resultsPublished`. Update save handling:

```typescript
updateExamPaperBlock(contestId, questionId, {
  kind: "question",
  question: {
    ...payload,
    ...(action ? { existing_grades_action: action } : {}),
  },
});
```

After `regrade`, `mark_pending`, or policy changes, invoke the existing contest refresh path so publication state is current.

- [ ] **Step 7: Add translations, verify GREEN, and commit**

Add matching `examEditor.lockedSave.*` keys to all four locale files. Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- \
  src/features/contest/components/admin/examEditor/lockedQuestionSaveImpact.test.ts \
  src/features/contest/components/admin/examEditor/LockedGradingSaveModal.test.tsx \
  src/features/contest/components/admin/examEditor/ExamQuestionEditCard.test.tsx \
  src/infrastructure/api/repositories/examPaper.repository.test.ts
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
```

Stage and commit the exact locked-editor files:

```bash
git add frontend/src/features/contest/components/admin/examEditor/lockedQuestionSaveImpact.ts \
  frontend/src/features/contest/components/admin/examEditor/lockedQuestionSaveImpact.test.ts \
  frontend/src/features/contest/components/admin/examEditor/LockedGradingSaveModal.tsx \
  frontend/src/features/contest/components/admin/examEditor/LockedGradingSaveModal.test.tsx \
  frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.tsx \
  frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.test.tsx \
  frontend/src/features/contest/components/admin/examEditor/ExamQuestionEditCard.module.scss \
  frontend/src/features/contest/components/admin/examEditor/ExamEditorLayout.tsx \
  frontend/src/infrastructure/api/repositories/examPaper.repository.ts \
  frontend/src/infrastructure/api/repositories/examPaper.repository.test.ts \
  frontend/src/infrastructure/api/repositories/examQuestions.repository.ts \
  frontend/src/features/contest/screens/settings/grading/components/ScorePolicyMenu.tsx \
  frontend/src/i18n/locales/en/contest.json frontend/src/i18n/locales/ja/contest.json \
  frontend/src/i18n/locales/ko/contest.json frontend/src/i18n/locales/zh-TW/contest.json
git commit -m "feat(frontend): confirm grading edits after exam lock"
```

---

### Task 6: Remove obsolete MCP snapshot stripping

**Files:**
- Modify: `mcp-server/server.py`
- Modify: `mcp-server/tests/test_server.py`

**Interfaces:**
- Produces: `_compact_answers(raw) -> Any` without a snapshot sanitizer.

- [ ] **Step 1: Replace strip-helper tests with compact-payload coverage**

Delete the two `_strip_snapshots` tests and snapshot keys in fixtures. Add:

```python
def test_compact_answers_projects_current_grading_fields():
    raw = [{
        "id": "1", "question_id": "q1", "question_prompt": "Current",
        "question_type": "essay", "answer": {"text": "response"}, "score": None,
    }]
    row = server._compact_answers(raw)[0]
    assert row["exam_answer_id"] == "1"
    assert row["question_prompt"] == "Current"
    assert "question_snapshot" not in row
```

- [ ] **Step 2: Verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build qjudge-mcp
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T qjudge-mcp \
  pytest -q tests/test_server.py
```

- [ ] **Step 3: Remove helper and verify GREEN**

Delete `_strip_snapshots()`. Change `_compact_answers()` from `data = _strip_snapshots(raw)` to `data = raw`, and remove every other helper call without adding a replacement sanitizer.

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T qjudge-mcp \
  pytest -q tests/test_server.py
git add mcp-server/server.py mcp-server/tests/test_server.py
git commit -m "refactor(mcp): remove answer snapshot stripping"
```

---

### Task 7: Run cross-layer verification

**Files:**
- Modify only if a failing verification identifies a defect in a file already listed above.

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: fresh migration, test, build, lint, and no-reference evidence.

- [ ] **Step 1: Verify migrations**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py migrate
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  python manage.py makemigrations --check --dry-run
```

Expected: both commands exit 0 and no model changes are pending.

- [ ] **Step 2: Run backend and MCP suites**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build qjudge-mcp
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T qjudge-mcp \
  pytest -q tests/test_server.py
```

Expected: 0 failures.

- [ ] **Step 3: Run frontend tests, checks, and build**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build frontend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test -- \
  src/features/contest/components/admin/examEditor \
  src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx \
  src/infrastructure/api/repositories/examAnswers.repository.test.ts \
  src/infrastructure/api/repositories/examPaper.repository.test.ts
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
```

Expected: every command exits 0; no new changed-file lint warnings.

- [ ] **Step 4: Run QJudge quality gates**

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
```

Expected: every gate exits 0.

- [ ] **Step 5: Prove active code has no answer-snapshot dependency**

```bash
rg -n "question_snapshot|correct_answer_snapshot|questionSnapshot|QuestionSnapshot" \
  backend/apps/contests frontend/src mcp-server \
  --glob '!backend/apps/contests/migrations/**' \
  --glob '!**/tests/**' --glob '!**/*.test.ts' --glob '!**/*.test.tsx'
git diff --check
git status --short
```

Expected: no active-code matches and no whitespace errors. Confirm remaining unrelated worktree changes were never staged.

- [ ] **Step 6: Compare implementation to the approved spec**

Review `docs/superpowers/specs/2026-08-10-remove-exam-answer-snapshot-design.md` line by line. If verification exposes a gap, fix it with a failing test first, rerun the relevant commands, stage exact corrected files, and commit:

```bash
git commit -m "fix(contests): close locked grading verification gaps"
```

If no correction is needed, do not create an empty commit.
