# Contest Exam-Only Model Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the retired Contest practice-delivery model and ineffective cheat-warning threshold while documenting the complete anti-cheat event timing across frontend, Django, Redis, PostgreSQL, and object storage.

**Architecture:** Keep `Contest` as the exam aggregate and retain standalone problem practice submissions as a separate submission source. Remove fixed or dead Contest policy fields and participant assignment state end to end, with a single schema migration and contract tests guarding the reduced API. Add three focused Mermaid sequence diagrams instead of one oversized diagram.

**Tech Stack:** Django, Django REST Framework, PostgreSQL, Redis, Celery, React, TypeScript, Vitest, Mermaid documentation.

## Global Constraints

- Preserve all existing user changes in the dirty worktree.
- Keep `Submission.source_type="practice"` and archived-contest publish-to-practice behavior.
- Do not introduce replacement policy tables or new configuration fields.
- Use the QJudge test compose wrapper for project commands.

---

### Task 1: Add Failing Exam-Only Contract Tests

**Files:**
- Create: `backend/apps/contests/tests/test_exam_only_contest_contract.py`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.test.ts`

**Interfaces:**
- Consumes: Django model metadata and DRF serializer field declarations.
- Produces: A regression contract requiring removed fields to be absent.

- [ ] **Step 1: Write the backend failing contract test**

```python
REMOVED_CONTEST_FIELDS = {"delivery_mode", "counts_toward_grade", "max_cheat_warnings"}
REMOVED_PARTICIPANT_FIELDS = {"assignment_state", "accepted_at", "submitted_at"}

def test_exam_only_models_drop_retired_fields():
    assert REMOVED_CONTEST_FIELDS.isdisjoint({field.name for field in Contest._meta.get_fields()})
    assert REMOVED_PARTICIPANT_FIELDS.isdisjoint(
        {field.name for field in ContestParticipant._meta.get_fields()}
    )
```

- [ ] **Step 2: Run the backend test and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q apps/contests/tests/test_exam_only_contest_contract.py
```

Expected: FAIL because the six model fields still exist.

- [ ] **Step 3: Add a frontend mapper assertion for the reduced contract**

Assert mapped Contest data and update payloads do not expose `deliveryMode`, `countsTowardGrade`, or `maxCheatWarnings`.

---

### Task 2: Remove Backend Fields And Practice Workflow

**Files:**
- Modify: `backend/apps/contests/models/contest.py`
- Modify: `backend/apps/contests/models/participants.py`
- Modify: `backend/apps/contests/models/__init__.py`
- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/views/contest.py`
- Modify: `backend/apps/contests/views/exam_events.py`
- Modify: `backend/apps/contests/views/exam_lifecycle.py`
- Modify: `backend/apps/contests/services/anticheat_config.py`
- Modify: `backend/apps/contests/services/exam_submission.py`
- Modify: `backend/apps/contests/services/participant_state.py`
- Modify: `backend/apps/classrooms/serializers.py`
- Modify: `backend/apps/classrooms/services/course_contests.py`
- Modify: `backend/apps/classrooms/services/participant_sync.py`
- Modify: `backend/apps/classrooms/views.py`
- Modify: `backend/apps/submissions/access_policy.py`
- Modify: `backend/apps/submissions/services.py`
- Create: `backend/apps/contests/migrations/0089_remove_retired_contest_delivery_fields.py`

**Interfaces:**
- Consumes: Existing exam lifecycle and standalone practice submission behavior.
- Produces: Exam-only Contest and participant models with reduced API responses.

- [ ] **Step 1: Remove six model fields and exports**

Remove the three Contest fields and the three ContestParticipant assignment fields. Remove `AssignmentState` only after all non-test imports are gone.

- [ ] **Step 2: Remove serializer and runtime branches**

Remove retired fields from list/detail/create serializers, event responses, anti-cheat config, classroom projections, participant reset, submission access, contest submission cleanup, and exam finalization.

- [ ] **Step 3: Add the schema migration**

Create six `migrations.RemoveField` operations depending on `0088_align_event_activity_choices`.

- [ ] **Step 4: Run backend contract and focused tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q \
  apps/contests/tests/test_exam_only_contest_contract.py \
  apps/contests/tests/test_exam_anticheat.py \
  apps/contests/tests/services/test_participant_state.py \
  apps/classrooms/tests/test_services.py
```

Expected: all selected tests pass after stale practice-only tests are removed or rewritten to assert exam behavior.

---

### Task 3: Remove Frontend Delivery And Warning Contract

**Files:**
- Modify: `frontend/src/core/entities/contest.entity.ts`
- Modify: `frontend/src/core/entities/classroom.entity.ts`
- Modify: `frontend/src/core/ports/contest.repository.ts`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts`
- Modify: `frontend/src/infrastructure/api/dto/classroom.dto.ts`
- Modify: `frontend/src/infrastructure/api/repositories/exam.repository.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.anticheat.mapper.ts`
- Modify: `frontend/src/infrastructure/mappers/classroom.mapper.ts`
- Modify: `frontend/src/features/contest/components/ExamModeWrapper.tsx`
- Modify: `frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.tsx`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/hooks/useExamAutoSave.ts`
- Modify: affected mocks, tests, and translations.

**Interfaces:**
- Consumes: Reduced backend Contest and exam-event payloads.
- Produces: Frontend entities and mappers with no retired delivery, assignment, or warning-threshold state.

- [ ] **Step 1: Remove retired TypeScript types and fields**

Remove `ContestDeliveryMode`, `AssignmentState`, `deliveryMode`, `countsTowardGrade`, `maxCheatWarnings`, `ExamModeState.maxWarnings`, and participant assignment timestamps.

- [ ] **Step 2: Remove mapper, repository, UI, and translation references**

Map all Contest flows as exam flows. Keep publish-to-practice labels that refer to copying problems into the public practice library.

- [ ] **Step 3: Run focused frontend tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test -- --run \
  src/infrastructure/mappers/contest.mapper.test.ts \
  src/features/contest/domain/anticheatModulePolicy.test.ts
```

Expected: selected tests pass.

---

### Task 4: Document Event Timing And Verify The Repository

**Files:**
- Modify: `docs/anticheat-event-recording-handover.md`
- Modify: `docs/anticheat-architecture.md`
- Regenerate: `backend/schema.yml`

**Interfaces:**
- Consumes: Current event, heartbeat, evidence, Redis, and storage implementations.
- Produces: Maintainer documentation matching runtime behavior and regenerated OpenAPI schema.

- [ ] **Step 1: Add three Mermaid sequence diagrams**

Document normal event ingestion, heartbeat timeout, and evidence upload/review with explicit frontend, Django, Redis, PostgreSQL, Celery, and object-storage participants.

- [ ] **Step 2: Remove stale architecture statements**

Remove references to deleted legacy anti-cheat endpoints, retired Contest fields, and any statement claiming capture upload happens before event creation.

- [ ] **Step 3: Regenerate schema and check migrations**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py makemigrations --check --dry-run
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py spectacular --file schema.yml
```

- [ ] **Step 4: Run final verification**

Run backend focused tests, frontend tests/build, architecture lint, repository searches for retired identifiers, and `git diff --check`.

