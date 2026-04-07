# Counts-Toward-Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `counts_toward_grade` boolean to Contest so that `delivery_mode=practice` can distinguish "homework (graded)" from "practice (ungraded, keep-latest-only)".

**Architecture:** One new model field (`counts_toward_grade`) on `Contest`, exposed through existing serializers and frontend types. Submission cleanup for pure-practice is handled at creation time in `SubmissionService`. No new models, no new endpoints, no delivery_mode enum change.

**Tech Stack:** Django 5 / DRF / PostgreSQL, React + TypeScript (Carbon), pytest

---

## File Map


| Action | Path                                                                   | Responsibility                                          |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Modify | `backend/apps/contests/models.py`                                      | Add `counts_toward_grade` field to `Contest`            |
| Create | `backend/apps/contests/migrations/0066_contest_counts_toward_grade.py` | Migration (auto-generated)                              |
| Modify | `backend/apps/contests/serializers.py`                                 | Expose field in list, detail, create/update serializers |
| Modify | `backend/apps/submissions/services.py`                                 | Practice keep-latest logic in `create_submission`       |
| Create | `backend/apps/contests/tests/test_counts_toward_grade.py`              | Backend tests                                           |
| Modify | `frontend/src/core/entities/contest.entity.ts`                         | Add `countsTowardGrade` to entity types                 |
| Modify | `frontend/src/infrastructure/api/dto/contest.dto.ts`                   | Add `counts_toward_grade` to DTO                        |
| Modify | `frontend/src/infrastructure/mappers/contest.mapper.ts`                | Map DTO → entity                                        |
| Modify | `frontend/src/core/ports/contest.repository.ts`                        | Add to `ContestUpdatePayload`                           |


---

### Task 1: Add `counts_toward_grade` field to Contest model

**Files:**

- Modify: `backend/apps/contests/models.py:140-151`
- **Step 1: Add the field**

In `backend/apps/contests/models.py`, add after the `delivery_mode` field block (after line 151):

```python
    counts_toward_grade = models.BooleanField(
        default=True,
        verbose_name='計入正式成績',
        help_text='True: 作業/考試（成績計入成績簿）; False: 純練習（僅保留最新提交、不計分）',
    )
```

Default is `True` for backward compatibility (all existing contests count).

- **Step 2: Generate migration**

Run:

```bash
cd backend
python manage.py makemigrations contests --name contest_counts_toward_grade
```

Expected: creates `backend/apps/contests/migrations/0066_contest_counts_toward_grade.py`

- **Step 3: Apply migration**

Run:

```bash
python manage.py migrate contests
```

Expected: `Applying contests.0066_contest_counts_toward_grade... OK`

- **Step 4: Commit**

```bash
git add backend/apps/contests/models.py backend/apps/contests/migrations/0066_contest_counts_toward_grade.py
git commit -m "feat(contest): add counts_toward_grade boolean field"
```

---

### Task 2: Expose field in serializers

**Files:**

- Modify: `backend/apps/contests/serializers.py:41` (list), `:130` (detail), `:392-416` (create/update)
- **Step 1: ContestListSerializer — add read field**

In `ContestListSerializer`, add `'counts_toward_grade'` to the `fields` list after `'delivery_mode'` (around line 54):

```python
        fields = [
            'id',
            'name',
            'start_time',
            'end_time',
            'status',
            'visibility',
            'requires_password',
            'delivery_mode',
            'counts_toward_grade',
            'owner_username',
            'participant_count',
            'is_registered',
            'question_edit_locked',
            'question_edit_locked_at',
            'question_edit_lock_trigger',
            'created_at',
        ]
```

- **Step 2: ContestDetailSerializer — add to fields**

In `ContestDetailSerializer.Meta.fields`, add `'counts_toward_grade'` after `'delivery_mode'` (around line 130):

```python
            'delivery_mode',
            'counts_toward_grade',
            'cheat_detection_enabled',
```

- **Step 3: ContestCreateUpdateSerializer — add to fields**

In `ContestCreateUpdateSerializer.Meta.fields`, add `'counts_toward_grade'` after `'delivery_mode'` (around line 403):

```python
            'delivery_mode',
            'counts_toward_grade',
            'cheat_detection_enabled',
```

- **Step 4: Run existing serializer tests**

Run:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test PYTEST_ADDOPTS='--no-cov' pytest apps/contests/tests/ -x -q 2>&1 | tail -20
```

Expected: all pass (no breakage)

- **Step 5: Commit**

```bash
git add backend/apps/contests/serializers.py
git commit -m "feat(contest): expose counts_toward_grade in all contest serializers"
```

---

### Task 3: Practice keep-latest submission logic

**Files:**

- Modify: `backend/apps/submissions/services.py:69-130`
- Test: `backend/apps/contests/tests/test_counts_toward_grade.py`
- **Step 1: Write the failing test**

Create `backend/apps/contests/tests/test_counts_toward_grade.py`:

```python
"""Tests for counts_toward_grade field and practice keep-latest behavior."""
import pytest
from django.utils import timezone
from apps.contests.models import Contest, ContestParticipant
from apps.submissions.models import Submission
from apps.problems.models import Problem
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="owner", password="pw")


@pytest.fixture
def student(db):
    return User.objects.create_user(username="student", password="pw")


@pytest.fixture
def problem(db, owner):
    return Problem.objects.create(
        title="Sum",
        created_by=owner,
        difficulty="easy",
        time_limit=1000,
        memory_limit=262144,
    )


@pytest.fixture
def practice_contest(db, owner):
    now = timezone.now()
    return Contest.objects.create(
        name="Practice",
        owner=owner,
        delivery_mode="practice",
        counts_toward_grade=False,
        status="published",
        start_time=now - timezone.timedelta(hours=1),
        end_time=now + timezone.timedelta(hours=1),
    )


@pytest.fixture
def homework_contest(db, owner):
    now = timezone.now()
    return Contest.objects.create(
        name="Homework",
        owner=owner,
        delivery_mode="practice",
        counts_toward_grade=True,
        status="published",
        start_time=now - timezone.timedelta(hours=1),
        end_time=now + timezone.timedelta(hours=1),
    )


@pytest.mark.django_db
class TestCountsTowardGradeField:
    def test_default_is_true(self, owner):
        c = Contest.objects.create(name="Default", owner=owner)
        assert c.counts_toward_grade is True

    def test_practice_ungraded(self, practice_contest):
        assert practice_contest.counts_toward_grade is False

    def test_homework_graded(self, homework_contest):
        assert homework_contest.counts_toward_grade is True


@pytest.mark.django_db
class TestPracticeKeepLatestSubmission:
    """When counts_toward_grade=False, only the latest submission per user+problem+contest survives."""

    def test_old_submission_deleted_on_new(self, practice_contest, student, problem):
        ContestParticipant.objects.create(
            contest=practice_contest, user=student, assignment_state="accepted"
        )
        old = Submission.objects.create(
            user=student,
            problem=problem,
            contest=practice_contest,
            source_type="contest",
            language="python",
            code="print(1)",
            status="AC",
        )
        new = Submission.objects.create(
            user=student,
            problem=problem,
            contest=practice_contest,
            source_type="contest",
            language="python",
            code="print(2)",
            status="pending",
        )
        from apps.submissions.services import SubmissionService
        SubmissionService.cleanup_practice_submissions(
            user=student,
            problem=problem,
            contest=practice_contest,
            current_submission=new,
        )
        assert not Submission.objects.filter(pk=old.pk).exists()
        assert Submission.objects.filter(pk=new.pk).exists()

    def test_homework_keeps_all(self, homework_contest, student, problem):
        ContestParticipant.objects.create(
            contest=homework_contest, user=student, assignment_state="accepted"
        )
        old = Submission.objects.create(
            user=student,
            problem=problem,
            contest=homework_contest,
            source_type="contest",
            language="python",
            code="print(1)",
            status="AC",
        )
        new = Submission.objects.create(
            user=student,
            problem=problem,
            contest=homework_contest,
            source_type="contest",
            language="python",
            code="print(2)",
            status="pending",
        )
        from apps.submissions.services import SubmissionService
        SubmissionService.cleanup_practice_submissions(
            user=student,
            problem=problem,
            contest=homework_contest,
            current_submission=new,
        )
        assert Submission.objects.filter(pk=old.pk).exists()
        assert Submission.objects.filter(pk=new.pk).exists()
```

- **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test PYTEST_ADDOPTS='--no-cov' pytest apps/contests/tests/test_counts_toward_grade.py -x -v 2>&1 | tail -30
```

Expected: FAIL — `AttributeError: type object 'SubmissionService' has no attribute 'cleanup_practice_submissions'`

- **Step 3: Implement cleanup_practice_submissions**

In `backend/apps/submissions/services.py`, add this class method to `SubmissionService` (after `create_and_dispatch`):

```python
    @staticmethod
    def cleanup_practice_submissions(
        *,
        user: "User",
        problem: "Problem",
        contest: "Contest",
        current_submission: "Submission",
    ) -> int:
        """
        For pure-practice contests (counts_toward_grade=False), delete all
        previous submissions for the same user+problem+contest, keeping only
        current_submission. Returns the number of deleted rows.
        """
        if contest.counts_toward_grade:
            return 0

        qs = Submission.objects.filter(
            user=user,
            problem=problem,
            contest=contest,
            source_type="contest",
        ).exclude(pk=current_submission.pk)
        count, _ = qs.delete()
        return count
```

- **Step 4: Call cleanup from create_and_dispatch**

In `SubmissionService.create_and_dispatch`, after `result.submission` is obtained and before returning, add:

```python
        if (
            result.source_type == "contest"
            and contest_id
            and not result.submission.is_test
        ):
            contest_obj = result.submission.contest
            if contest_obj and not contest_obj.counts_toward_grade:
                cls.cleanup_practice_submissions(
                    user=user,
                    problem=result.submission.problem,
                    contest=contest_obj,
                    current_submission=result.submission,
                )
```

- **Step 5: Run test to verify it passes**

Run:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test PYTEST_ADDOPTS='--no-cov' pytest apps/contests/tests/test_counts_toward_grade.py -x -v 2>&1 | tail -30
```

Expected: 5 passed

- **Step 6: Run full submission tests to verify no regression**

Run:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test PYTEST_ADDOPTS='--no-cov' pytest apps/submissions/ -x -q 2>&1 | tail -20
```

Expected: all pass

- **Step 7: Commit**

```bash
git add backend/apps/submissions/services.py backend/apps/contests/tests/test_counts_toward_grade.py
git commit -m "feat(submissions): keep-latest cleanup for pure-practice contests"
```

---

### Task 4: Frontend types and mapper

**Files:**

- Modify: `frontend/src/core/entities/contest.entity.ts`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts`
- Modify: `frontend/src/core/ports/contest.repository.ts`
- **Step 1: Add to entity types**

In `frontend/src/core/entities/contest.entity.ts`, add to the `Contest` interface (after `deliveryMode`):

```typescript
  countsTowardGrade?: boolean;
```

And in `ContestDetail` (after `deliveryMode: ContestDeliveryMode;`):

```typescript
  countsTowardGrade: boolean;
```

And in `ContestUpdateRequest` (after `resultsPublished`):

```typescript
  countsTowardGrade?: boolean;
```

- **Step 2: Add to DTO**

In `frontend/src/infrastructure/api/dto/contest.dto.ts`:

In `ContestDto`, add after `delivery_mode`:

```typescript
  counts_toward_grade?: boolean;
```

In `ContestDetailDto` (if it re-declares delivery fields, add there too; otherwise inherited).

- **Step 3: Update mapper**

In `frontend/src/infrastructure/mappers/contest.mapper.ts`:

In `mapContestDto`, add after the `deliveryMode` mapping:

```typescript
    countsTowardGrade: dto.counts_toward_grade ?? true,
```

In `mapContestDetailDto`, add after `deliveryMode`:

```typescript
    countsTowardGrade: dto.counts_toward_grade ?? true,
```

In `mapContestUpdateRequestToDto` (if it exists), add:

```typescript
    counts_toward_grade: req.countsTowardGrade,
```

- **Step 4: Add to ContestUpdatePayload**

In `frontend/src/core/ports/contest.repository.ts`, in `ContestUpdatePayload`, add:

```typescript
  countsTowardGrade?: boolean;
```

- **Step 5: Run frontend lint**

Run:

```bash
cd frontend
npx eslint src/core/entities/contest.entity.ts src/infrastructure/api/dto/contest.dto.ts src/infrastructure/mappers/contest.mapper.ts src/core/ports/contest.repository.ts 2>&1
```

Expected: no errors

- **Step 6: Commit**

```bash
git add frontend/src/core/entities/contest.entity.ts frontend/src/infrastructure/api/dto/contest.dto.ts frontend/src/infrastructure/mappers/contest.mapper.ts frontend/src/core/ports/contest.repository.ts
git commit -m "feat(frontend): add countsTowardGrade to contest types and mapper"
```

---

### Task 5: API serializer integration test

**Files:**

- Modify: `backend/apps/contests/tests/test_counts_toward_grade.py`
- **Step 1: Add serializer round-trip tests**

Append to `backend/apps/contests/tests/test_counts_toward_grade.py`:

```python
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestCountsTowardGradeAPI:
    def test_create_contest_with_field(self, owner):
        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.post("/api/v1/contests/", {
            "name": "Graded HW",
            "delivery_mode": "practice",
            "counts_toward_grade": True,
        }, format="json")
        assert resp.status_code == 201
        assert resp.json()["counts_toward_grade"] is True

    def test_create_defaults_to_true(self, owner):
        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.post("/api/v1/contests/", {
            "name": "No flag",
        }, format="json")
        assert resp.status_code == 201
        assert resp.json()["counts_toward_grade"] is True

    def test_update_to_false(self, homework_contest, owner):
        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.patch(
            f"/api/v1/contests/{homework_contest.id}/",
            {"counts_toward_grade": False},
            format="json",
        )
        assert resp.status_code == 200
        homework_contest.refresh_from_db()
        assert homework_contest.counts_toward_grade is False

    def test_detail_exposes_field(self, practice_contest, owner):
        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.get(f"/api/v1/contests/{practice_contest.id}/")
        assert resp.status_code == 200
        assert resp.json()["counts_toward_grade"] is False
```

- **Step 2: Run tests**

Run:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.settings.test PYTEST_ADDOPTS='--no-cov' pytest apps/contests/tests/test_counts_toward_grade.py -x -v 2>&1 | tail -30
```

Expected: all pass

- **Step 3: Commit**

```bash
git add backend/apps/contests/tests/test_counts_toward_grade.py
git commit -m "test(contest): API integration tests for counts_toward_grade"
```

---

## Self-Review

**1. Spec coverage:**

- ✅ `counts_toward_grade` field added (`True` = homework/exam, `False` = practice)
- ✅ Practice keep-latest: `cleanup_practice_submissions` deletes old submissions
- ✅ Homework keeps all submissions (method is a no-op when `counts_toward_grade=True`)
- ✅ Frontend types updated across all layers (entity → DTO → mapper → port)

**2. Placeholder scan:** No TBD/TODO/vague steps found.

**3. Type consistency:**

- Backend field: `counts_toward_grade` (snake_case) — consistent across model, serializers, tests
- Frontend entity: `countsTowardGrade` (camelCase) — consistent across entity, mapper, port
- Frontend DTO: `counts_toward_grade` (snake_case) — matches API response

