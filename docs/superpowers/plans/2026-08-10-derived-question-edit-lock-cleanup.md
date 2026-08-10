# Derived Question Edit Lock Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the materialized contest question-lock fields, derive the lock from current student exposure evidence, and delete the adjacent unused snapshot/fallback code.

**Architecture:** `apps.contests.services.question_edit_lock` remains the single domain policy entry point and becomes read-only apart from a small transaction guard that locks the `Contest` row. Detail serialization computes the boolean only when needed; frontend infrastructure maps that boolean into the existing domain entity. Every exposure-creating write and protected content mutation serializes on the same `Contest` row so the derived check cannot race with the first answer or submission.

**Tech Stack:** Django 5 / Django REST Framework / PostgreSQL transactions, React 19 / TypeScript / Vitest, Docker Compose test environment.

## Global Constraints

- Deleting the last current exposure record unlocks question editing.
- Paper exams lock on any participant `started_at` or any `ExamAnswer`.
- Coding contests lock on a formal, non-test submission by a user who cannot manage the contest.
- Contest detail keeps computed `question_edit_locked`; contest list, API, DTO, mapper, and entity remove lock timestamp and trigger fields.
- Locked editors stop auto-save and show the existing notification on an explicit save attempt.
- Do not add audit/version fields or preserve materialized-lock compatibility fallbacks.
- Run backend/frontend commands inside the QJudge Compose environment.

---

### Task 1: Derived contest lock policy

**Files:**
- Create: `backend/apps/contests/tests/services/test_question_edit_lock.py`
- Modify: `backend/apps/contests/services/question_edit_lock.py`
- Modify: `backend/apps/contests/services/__init__.py`

**Interfaces:**
- Produces: `is_contest_question_edit_locked(contest: Contest) -> bool`
- Produces: `lock_contest_for_question_edit(contest: Contest, actor_id: int | None, action: str | None) -> Contest`; caller must already be inside `transaction.atomic()`.
- Preserves: `ensure_contest_question_editable(*, contest: Contest, actor_id: int | None = None, action: str | None = None) -> None` and `ContestQuestionEditLocked` API behavior.

- [ ] **Step 1: Write failing paper-exam predicate tests**

Add tests with literal expected booleans. The production mutation that must make each test fail is removing either evidence branch or retaining an irreversible flag:

```python
@pytest.mark.django_db
def test_paper_exam_lock_tracks_current_started_participant(contest, student):
    contest.contest_type = "paper_exam"
    contest.save(update_fields=["contest_type"])
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        started_at=timezone.now(),
    )

    assert is_contest_question_edit_locked(contest) is True

    participant.delete()
    assert is_contest_question_edit_locked(contest) is False


@pytest.mark.django_db
def test_paper_exam_lock_tracks_current_answer_even_without_started_at(contest, student):
    contest.contest_type = "paper_exam"
    contest.save(update_fields=["contest_type"])
    participant = ContestParticipant.objects.create(contest=contest, user=student)
    question = ExamQuestion.objects.create(
        contest=contest,
        question_type=ExamQuestionType.ESSAY,
        prompt="Explain",
        score=5,
        order=0,
    )
    answer = ExamAnswer.objects.create(
        participant=participant,
        question=question,
        answer={"text": "response"},
    )

    assert is_contest_question_edit_locked(contest) is True
    answer.delete()
    assert is_contest_question_edit_locked(contest) is False
```

- [ ] **Step 2: Write failing coding predicate tests**

Cover a student formal submission, owner submission, `is_test=True`, practice source, and deletion of the last qualifying submission:

```python
submission = Submission.objects.create(
    user=student,
    contest=contest,
    problem=problem,
    source_type="contest",
    is_test=False,
    language="python",
    code="print(1)",
)
assert is_contest_question_edit_locked(contest) is True
submission.delete()
assert is_contest_question_edit_locked(contest) is False
```

- [ ] **Step 3: Run the service tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/contests/tests/services/test_question_edit_lock.py
```

Expected: collection/import failure because `is_contest_question_edit_locked` does not exist.

- [ ] **Step 4: Implement the minimal derived policy**

Replace writer hooks and trigger logging with the predicate. Use current evidence and the canonical manager permission:

```python
def is_contest_question_edit_locked(contest: Contest) -> bool:
    if contest.contest_type == "paper_exam":
        return (
            contest.registrations.filter(started_at__isnull=False).exists()
            or ExamAnswer.objects.filter(participant__contest=contest).exists()
        )

    submissions = (
        Submission.objects.filter(
            contest=contest,
            source_type="contest",
            is_test=False,
        )
        .select_related("user")
        .iterator()
    )
    return any(not can_manage_contest(row.user, contest) for row in submissions)
```

Make `ensure_contest_question_editable` call only this predicate. Add a row-locking helper that reloads the contest with `select_for_update()`, calls `ensure_contest_question_editable`, and returns the locked object. Remove `lock_contest_question_editing`, `maybe_lock_from_*`, `is_non_empty_exam_answer`, trigger-specific imports, and unused package exports.

- [ ] **Step 5: Run the service tests and verify GREEN**

Run the command from Step 3. Expected: all service tests pass.

- [ ] **Step 6: Commit the policy unit**

```bash
git add backend/apps/contests/services backend/apps/contests/tests/services/test_question_edit_lock.py
.codex/skills/qjudge-github-workflow-owner/scripts/commit-changes.sh "refactor(contests): derive question edit lock"
```

---

### Task 2: Remove database fields and compute the detail API contract

**Files:**
- Modify: `backend/apps/contests/models/contest.py`
- Create: `backend/apps/contests/migrations/0095_remove_contest_question_edit_lock_fields.py`
- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/tests/management/test_contest_viewset_actions.py`
- Modify: `backend/apps/contests/tests/exam/test_exam_state.py`
- Delete: `backend/apps/contests/management/commands/backfill_contest_question_edit_lock.py`
- Delete: `backend/apps/contests/tests/management/test_backfill_question_edit_lock.py`
- Regenerate: `backend/schema.yml`

**Interfaces:**
- Consumes: `is_contest_question_edit_locked(contest)` from Task 1.
- Produces: detail JSON field `question_edit_locked: boolean`.
- Removes: model/API fields `question_edit_locked_at` and `question_edit_lock_trigger`; removes the lock boolean from list responses.

- [ ] **Step 1: Rewrite API tests to describe the computed contract**

Use a real student submission instead of setting a model flag:

```python
def test_contest_detail_computes_question_edit_lock_from_submission(
    api_client,
    owner,
    student,
    contest,
):
    problem = _create_problem("Lock evidence", owner)
    Submission.objects.create(
        user=student,
        contest=contest,
        problem=problem,
        source_type="contest",
        is_test=False,
        language="python",
        code="print(1)",
    )
    response = api_client.get(f"/api/v1/contests/{contest.id}/")
    assert response.data["question_edit_locked"] is True
    assert "question_edit_locked_at" not in response.data
    assert "question_edit_lock_trigger" not in response.data
```

Add a list assertion that all three materialized fields are absent. Update lifecycle tests to assert the predicate/detail behavior after start rather than refreshing fields.

- [ ] **Step 2: Run focused API tests and verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests/management/test_contest_viewset_actions.py \
  apps/contests/tests/exam/test_exam_state.py
```

Expected: old timestamp/trigger/list fields are still returned.

- [ ] **Step 3: Remove model fields and add serializer computation**

Delete `QuestionEditLockTrigger`, the three fields, and `has_exam_started`. In `ContestDetailSerializer` use:

```python
question_edit_locked = serializers.SerializerMethodField()

def get_question_edit_locked(self, obj):
    return is_contest_question_edit_locked(obj)
```

Remove lock fields from `ContestListSerializer`. Add migration operations that remove only the three current fields; do not edit migrations `0057` or `0094`. Delete the obsolete backfill command and its materialized-state tests.

- [ ] **Step 4: Regenerate OpenAPI schema and verify GREEN**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py spectacular --file schema.yml
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests/management/test_contest_viewset_actions.py \
  apps/contests/tests/exam/test_exam_state.py \
  apps/contests/tests/services/test_question_edit_lock.py
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py makemigrations --check --dry-run
```

Expected: tests pass and Django reports no pending model changes.

- [ ] **Step 5: Commit the persistence/API unit**

```bash
git add backend/apps/contests backend/schema.yml
.codex/skills/qjudge-github-workflow-owner/scripts/commit-changes.sh "refactor(contests): remove materialized question lock"
```

---

### Task 3: Serialize exposure writes and protected content mutations

**Files:**
- Modify: `backend/apps/contests/views/exam_lifecycle.py`
- Modify: `backend/apps/contests/views/exam_answer.py`
- Modify: `backend/apps/submissions/services.py`
- Modify: `backend/apps/contests/views/exam_question.py`
- Modify: `backend/apps/contests/views/exam_paper.py`
- Modify: `backend/apps/contests/views/exam_question_group.py`
- Modify: `backend/apps/contests/views/problem.py`
- Modify: `backend/apps/problems/views.py`
- Modify: affected tests under `backend/apps/contests/tests/exam/`, `backend/apps/contests/tests/management/`, `backend/apps/submissions/tests/`, and `backend/apps/problems/test_problems_api.py`.

**Interfaces:**
- Consumes: `lock_contest_for_question_edit(*, contest: Contest, actor_id: int | None = None, action: str | None = None) -> Contest` and `is_contest_question_edit_locked(contest: Contest) -> bool`.
- Preserves: all existing 409 payloads and grading-only update behavior.

- [ ] **Step 1: Convert field-based guard fixtures into exposure evidence**

For paper-exam API guard tests, create a participant with `started_at=timezone.now()`. For coding contest/problem guard tests, create a qualifying `Submission`. Add an explicit deletion assertion proving the same endpoint succeeds after removing the final evidence.

- [ ] **Step 2: Add transaction-lock regression tests**

Patch/spy on `Contest.objects.select_for_update` at the service boundary only where a real concurrent integration test is impractical. Assert the observable write completes while the contest row is held by placing a test hook inside the atomic block; do not assert framework internals or mock the predicate itself. At minimum cover answer upsert and contest submission creation.

- [ ] **Step 3: Run the affected guard tests and verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests/exam/test_exam_questions_api.py \
  apps/contests/tests/exam/test_exam_answers.py \
  apps/contests/tests/management/test_contest_viewset_actions.py \
  apps/submissions/tests/test_submission_service.py \
  apps/problems/test_problems_api.py
```

Expected: old writer-hook assertions or field access fail and delete-to-unlock behavior is not yet implemented throughout the endpoints.

- [ ] **Step 4: Remove exposure writers and lock the evidence transactions**

- `start_exam`: keep its existing `Contest.objects.select_for_update()` transaction and remove the flag writer.
- `submit_answer`: wrap question lookup plus answer upsert/grading in `transaction.atomic()`, reload the contest with `select_for_update()`, and remove `maybe_lock_from_exam_answer`.
- `SubmissionService.create_submission`: for any contest submission, reload the contest with `select_for_update()` before `Submission.objects.create`; remove `maybe_lock_from_coding_submission`.

- [ ] **Step 5: Guard every protected paper/coding content mutation inside its transaction**

Move checks inside `transaction.atomic()` and make the contest row the first locked row:

```python
with transaction.atomic():
    contest = lock_contest_for_question_edit(
        contest=contest,
        actor_id=request.user.id,
        action="exam_question.reorder",
    )
    # lock/update questions, groups, or bindings only after this point
```

For grading-aware question update, lock the contest row, call `is_contest_question_edit_locked`, and route locked changes through `apply_locked_question_update`. For shared `CodingProblem` update/delete, lock related contests in ascending ID order, then evaluate each predicate and hold all row locks until the problem mutation completes.

- [ ] **Step 6: Run the affected tests and verify GREEN**

Run the command from Step 3. Expected: all affected endpoint/service tests pass.

- [ ] **Step 7: Commit the transaction/guard unit**

```bash
git add backend/apps/contests/views backend/apps/submissions backend/apps/problems backend/apps/contests/tests
.codex/skills/qjudge-github-workflow-owner/scripts/commit-changes.sh "fix(contests): serialize question exposure and edits"
```

---

### Task 4: Collapse the locked grading update result

**Files:**
- Modify: `backend/apps/contests/services/locked_question_update.py`
- Modify: `backend/apps/contests/views/exam_question.py`
- Modify: `backend/apps/contests/views/exam_paper.py`
- Modify: `backend/apps/contests/tests/exam/test_locked_question_update.py`

**Interfaces:**
- Changes: `apply_locked_question_update(*, question: ExamQuestion, validated_data: dict, action: ExistingGradesAction | None) -> ExamQuestion`.
- Removes: `LockedQuestionUpdateResult`, `affected_answers`, and `results_unpublished` return bookkeeping.

- [ ] **Step 1: Rewrite tests and callers to expect an `ExamQuestion`**

```python
updated = apply_locked_question_update(
    question=question,
    validated_data={"correct_answer": "B"},
    action="regrade",
)
assert updated.pk == question.pk
assert updated.correct_answer == "B"
```

Keep assertions on real answer scores and `contest.results_published`; those are the behavior. Remove assertions on wrapper metadata.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/contests/tests/exam/test_locked_question_update.py
```

Expected: return value is still `LockedQuestionUpdateResult`.

- [ ] **Step 3: Return the question directly and delete dead bookkeeping**

Remove the dataclass import/class and counters. Preserve regrading, mark-pending, score recalculation, result unpublishing, cache invalidation, and transactions. Update both views from `result.question` to the returned question.

- [ ] **Step 4: Verify GREEN and commit**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/contests/tests/exam/test_locked_question_update.py
git add backend/apps/contests/services/locked_question_update.py backend/apps/contests/views backend/apps/contests/tests/exam/test_locked_question_update.py
.codex/skills/qjudge-github-workflow-owner/scripts/commit-changes.sh "refactor(contests): simplify locked grading update"
```

---

### Task 5: Remove frontend lock metadata, score-policy fallback, and snapshot fixture

**Files:**
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.test.ts`
- Modify: `frontend/src/core/entities/contest.entity.ts`
- Modify: `frontend/src/features/contest/screens/settings/grading/components/ScorePolicyMenu.tsx`
- Create: `frontend/src/features/contest/screens/settings/grading/components/ScorePolicyMenu.test.tsx`
- Delete: `frontend/src/features/contest/screens/settings/grading/components/ScorePolicyModal.tsx`
- Modify: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx`

**Interfaces:**
- Keeps: `ContestDetailDto.question_edit_locked?: boolean` and `Contest.questionEditLocked?: boolean`.
- Removes: timestamp/trigger DTO and entity properties.
- Changes: `ScorePolicyMenuProps.impactContext` from optional to required.

- [ ] **Step 1: Add a failing mapper contract test**

```typescript
const result = mapContestDetailDto({
  id: "contest-1",
  name: "Exam",
  question_edit_locked: true,
  question_edit_locked_at: "2026-08-10T12:00:00+08:00",
  question_edit_lock_trigger: "exam_started",
  permissions: {},
  problems: [],
} as any);

expect(result.questionEditLocked).toBe(true);
expect(result).not.toHaveProperty("questionEditLockedAt");
expect(result).not.toHaveProperty("questionEditLockTrigger");
```

- [ ] **Step 2: Add a failing score-policy behavior test**

Render the real menu with complete `impactContext`, select “不計分”, and assert the impact dialog heading/content appears before the repository call. The production mutation caught is restoring the simple fallback or committing without impact review.

- [ ] **Step 3: Run frontend tests and verify RED**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- \
  src/infrastructure/mappers/contest.mapper.test.ts \
  src/features/contest/screens/settings/grading/components/ScorePolicyMenu.test.tsx \
  src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx
```

Expected: mapper still exposes metadata and/or the new menu test fails before fallback removal.

- [ ] **Step 4: Delete frontend Legacy/fallback paths**

Remove the timestamp/trigger properties and mapper assignments. Make `impactContext` required, remove `modalOpen`, `targetPolicy`, `ScorePolicyModal`, and all conditional fallback branches. Always compute/open `ScorePolicyImpactDialog`, including after redistribution target selection. Remove only the injected `questionSnapshot` fixture and its legacy-specific assertion; keep the repository regression assertion that answers do not expose a snapshot.

- [ ] **Step 5: Run focused tests and build, then commit**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- \
  src/infrastructure/mappers/contest.mapper.test.ts \
  src/features/contest/screens/settings/grading/components/ScorePolicyMenu.test.tsx \
  src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run build
git add frontend/src
.codex/skills/qjudge-github-workflow-owner/scripts/commit-changes.sh "refactor(frontend): remove question lock fallbacks"
```

Expected: focused tests and production build pass.

---

### Task 6: Full verification and residual-symbol audit

**Files:**
- Modify only files needed to fix regressions caused by Tasks 1–5.

**Interfaces:**
- Verifies the complete design; introduces no new behavior.

- [ ] **Step 1: Audit removed symbols**

```bash
rg -n "question_edit_locked_at|question_edit_lock_trigger|QuestionEditLockTrigger|lock_contest_question_editing|maybe_lock_from_|LockedQuestionUpdateResult|ScorePolicyModal|questionSnapshot" backend frontend
```

Expected: only historical migrations and the intentional no-snapshot regression assertion may match.

- [ ] **Step 2: Run backend affected and migration suites**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests apps/submissions/tests/test_submission_service.py apps/problems/test_problems_api.py
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py migrate --plan
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py makemigrations --check --dry-run
```

- [ ] **Step 3: Run full frontend test/build and quality gates**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run build
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
```

Record any known baseline-only naming failures separately; no new violation is accepted.

- [ ] **Step 4: Inspect final diff and commit any verification-only corrections**

```bash
git diff --check
git status --short
git log --oneline --decorate -8
```

If verification required corrections, stage only those files and commit with a scoped `fix:` message. Otherwise leave the worktree clean.
