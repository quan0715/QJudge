# Question Bank Legacy Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove runtime dependence on legacy question-bank adapters so QJudge uses `QuestionAsset`, `QuestionVersion`, `QuestionBankMembership`, and `ContestQuestionBinding` as the canonical question-bank and contest-binding model.

**Architecture:** `QuestionAsset` and `QuestionVersion` own all question content and versioned payload. `QuestionBankMembership` owns bank collection membership. `ContestQuestionBinding` owns formal contest binding and keeps `CodingProblem` / `ExamQuestion` as assessment adapters, without routing through a materialized bank `Question` adapter.

**Tech Stack:** Django, Django REST Framework, PostgreSQL migrations, pytest.

## Global Constraints

- Do not touch unrelated frontend autosave work already present in the worktree.
- Keep `CodingProblem` as the coding execution adapter.
- Keep `ExamQuestion` as the paper-exam assessment adapter.
- Remove legacy bank adapter runtime paths before schema removal.
- Use focused pytest coverage for each changed behavior before broad cleanup.

---

### Task 1: Asset-Only Question Bank Runtime

**Files:**
- Modify: `backend/apps/question_bank/serializers.py`
- Modify: `backend/apps/question_bank/views.py`
- Modify: `backend/apps/question_bank/read_models.py`
- Modify: `backend/apps/question_bank/write_workflows.py`
- Modify: `backend/apps/question_bank/question_assets.py`
- Test: `backend/apps/question_bank/tests/test_question_asset_integration.py`

**Interfaces:**
- Consumes: `QuestionAsset`, `QuestionVersion`, `QuestionBankMembership`.
- Produces: `create_bank_question(...) -> QuestionBankMembership`, `update_bank_question_membership(...) -> QuestionBankMembership`, response rows keyed by membership id.

- [x] Add tests that creating, patching, cloning, and inbox ingesting bank items uses asset memberships only.
- [x] Replace `QuestionBankItemWriteSerializer` with a plain serializer that validates the same API fields without binding to a model adapter.
- [x] Make question detail resolution membership-first and remove adapter fallback from runtime views.
- [x] Make clone-to-my-bank clone asset membership directly.
- [x] Make inbox ingest dedupe and move by `QuestionBankMembership.question_asset`.
- [x] Run focused question bank tests.

### Task 2: Contest Import Without Bank Adapter

**Files:**
- Modify: `backend/apps/question_bank/import_resolver.py`
- Modify: `backend/apps/contests/views/problem.py`
- Modify: `backend/apps/contests/views/exam_question.py`
- Test: `backend/apps/contests/tests/management/test_contest_viewset_actions.py`
- Test: `backend/apps/contests/tests/exam/test_exam_questions_api.py`

**Interfaces:**
- Consumes: bank membership UUIDs only.
- Produces: contest coding/exam imports from `QuestionAsset.latest_version.payload` without `Question`.

- [x] Add tests that non-membership ids are rejected and membership ids import correctly.
- [x] Change import resolver to return an asset-backed import projection.
- [x] Change coding import to build `CodingProblem` from asset payload.
- [x] Change exam import to build `ExamQuestion` from asset payload and create/update `ContestQuestionBinding`.
- [x] Run focused contest import tests.

### Task 3: Schema Removal

**Files:**
- Modify: `backend/apps/question_bank/models.py`
- Modify: `backend/apps/question_bank/admin.py`
- Create: `backend/apps/question_bank/migrations/0017_eliminate_question_bank_legacy_adapters.py`
- Delete: `backend/apps/question_bank/management/commands/audit_question_bank_legacy.py`
- Delete: `backend/apps/question_bank/tests/test_audit_question_bank_legacy.py`

**Interfaces:**
- Consumes: migrated runtime from Tasks 1 and 2.
- Produces: no `Question`, no `QuestionCodingExt`, no `QuestionBankMembership.legacy_question`.

- [x] Add a migration that drops `questions_coding_ext`, drops `questions`, and removes membership adapter linkage.
- [x] Remove model/admin imports for `Question` and `QuestionCodingExt`.
- [x] Remove the one-time audit command after schema removal.
- [x] Run migration checks and focused tests.

### Task 4: Exam Binding Naming Cleanup

**Files:**
- Modify: `backend/apps/question_bank/models.py`
- Modify: `backend/apps/question_bank/question_assets.py`
- Modify: `backend/apps/contests/views/exam_question.py`
- Create: `backend/apps/question_bank/migrations/0017_eliminate_question_bank_legacy_adapters.py`
- Create: `backend/apps/contests/migrations/0082_rename_exam_question_asset_relations.py`
- Create: `backend/apps/problems/migrations/0023_rename_coding_problem_asset_relations.py`
- Test: `backend/apps/question_bank/tests/test_question_asset_integration.py`

**Interfaces:**
- Consumes: `ExamQuestion` as a valid assessment adapter.
- Produces: `ContestQuestionBinding.exam_question`, with no `legacy_exam_question` runtime name.

- [x] Rename `legacy_exam_question` to `exam_question`.
- [x] Rename adapter related names to `exam_question_adapters` / `coding_problem_adapters`.
- [x] Update queries and tests to use the formal adapter name.
- [x] Run focused exam question/binding tests.

### Task 5: Verification

**Files:**
- No production files.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified backend cleanup.

- [x] Run focused pytest suites for question bank, contest bank imports, and problem import.
- [x] Run architecture/static searches for removed symbols.
- [x] Run migration plan check.
- [x] Document any intentionally retained `legacy_*` occurrences limited to historical migrations or unrelated domains.
