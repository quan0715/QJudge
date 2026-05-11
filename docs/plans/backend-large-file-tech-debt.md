# Backend Large File Tech Debt Plan

**Created:** 2026-05-09  
**Last updated:** 2026-05-10  
**Status:** in progress  
**Scope:** Django backend production code and related backend tests  
**Owner:** backend architecture / contest domain maintainers

## Summary

Backend has accumulated several large single files that now act as
implicit composition roots. The main risk is not line count by itself,
but mixed responsibilities: serializers, view actions, domain read
models, API orchestration, storage workflows, and tests are often
co-located in one file. That makes small feature work harder to review,
raises merge-conflict probability, and allows old API/service patterns
to re-enter during maintenance.

This plan breaks the debt down into small, reviewable refactors. Each
phase migrates runtime imports directly, keeps router-visible names
stable, then tightens architecture safeguards after callers are stable.
The first cleanup slices have already removed several compatibility
facades and ambiguous legacy names; future work should keep following
that direct-import rule.

## Completed Work

| Slice | Status | Result | Verification |
|---|---|---|---|
| Users view split | completed locally | Removed `backend/apps/users/views/_impl.py` and `profile.py`; split account, preferences, avatar, password, and login-record endpoints into endpoint-specific modules. | `pytest -q apps/users/tests` passed |
| Judge shim removal | completed locally | Removed `apps/judge/docker_runner.py` and `apps/judge/python_judge.py`; tests and callers now use the concrete judge entrypoints directly. | Judge/problem/submission focused tests passed |
| Problem model alias cleanup | completed locally | Removed the ambiguous `Problem = CodingProblem` alias and migrated backend imports to `CodingProblem`. | Problems, submissions, and question bank focused tests passed |
| Contest detail cache cleanup | completed locally | Removed the write-only contest detail cache helper and its signal calls; there was no runtime read side. | Architecture cleanup test covers absence of `detail_cache` imports |
| Exam service HTTP boundary cleanup | completed locally | `validate_exam_operation` now raises DRF exceptions; device conflict construction returns payload data, with view-side response adapters. | `apps/contests/tests/test_exam_service_boundaries.py` passed |
| Question bank import resolver | completed locally | Shared `apps/question_bank/import_resolver.py` now serves both coding and exam imports with `allowed_question_types`. | Import resolver regression tests passed |
| Contest scope role cleanup | completed locally | Removed `get_user_role_in_contest()` and legacy role mapping; backend and frontend now use canonical scope roles only. | Access/scope/listing/submission/standing focused tests passed |

## Next Cleanup Queue

These are smaller follow-up candidates before starting the larger file
splits:

1. Finish direct migration away from remaining legacy test names where
   the word `legacy` no longer describes behavior.
2. Review `apps/contests/access_policy.py` and adjacent permission
   helpers for stale comments or aliases after the scope-role cleanup.
3. Remove any single-caller backend helpers discovered while splitting
   `contests/serializers.py` and `views/contest.py`.
4. Add the file-size report/guard after the current local cleanup branch
   is stable, so the allowlist reflects the reduced baseline.

## Current Scan

Updated after the first cleanup slices on 2026-05-10.

Command used:

```bash
rg --files backend -g '*.py' -g '!**/migrations/**' -g '!**/tests/**' -g '!**/test_*.py' -g '!**/tests.py' \
  | xargs wc -l \
  | sort -nr \
  | head -40
```

Largest production files at scan time:

| File | Lines | Primary issue |
|---|---:|---|
| `backend/apps/contests/serializers.py` | 1226 | Multiple unrelated serializer families in one module |
| `backend/apps/contests/views/contest.py` | 1114 | Contest management, registration, reports, participants, and overview actions mixed |
| `backend/apps/contests/models.py` | 932 | Many model classes and enums in one Django model module |
| `backend/apps/ai/services/run_runtime.py` | 774 | Run lifecycle, SSE parsing, cancellation, metadata, usage, and persistence mixed |
| `backend/apps/contests/views/exam_answer.py` | 751 | Student answer APIs, grading projection, submit, dashboard summary, and import/export concerns |
| `backend/apps/question_bank/question_assets.py` | 697 | Asset payload building, version publishing, sync, membership, cleanup mixed |
| `backend/apps/contests/exporters/renderers/student_report.py` | 681 | Report rendering, aggregation, formatting, and presentation rules mixed |
| `backend/apps/question_bank/bank_workflows.py` | 668 | Bank CRUD, membership, copy/import, and permission workflow code mixed |
| `backend/apps/contests/services/participant_dashboard.py` | 655 | Paper report, coding report, event feed, timeline, and evidence merge logic mixed |
| `backend/apps/users/services.py` | 625 | User lifecycle, profile, email verification, and preference helpers mixed |
| `backend/apps/classrooms/views.py` | 611 | Classroom lifecycle, membership, invitations, and contest binding actions mixed |
| `backend/apps/contests/views/exam_evidence.py` | 604 | Evidence upload, metadata, retrieval, and storage orchestration mixed |

Large backend test files also need follow-up:

| File | Lines | Primary issue |
|---|---:|---|
| `backend/apps/question_bank/tests/test_api.py` | 1573 | Many permission and CRUD scenarios in one module |
| `backend/apps/contests/tests/management/test_contest_viewset_actions.py` | 1538 | Multiple contest viewset action groups in one test module |
| `backend/apps/contests/tests/test_exam_anticheat.py` | 1383 | Anti-cheat policy, event, and screen-share cases mixed |

## Goals

- Reduce the largest production backend files below 600 lines where
  practical, without changing external API behavior.
- Migrate internal imports directly during splits; do not keep
  compatibility facades for app-internal refactors. If a documented
  external import path must remain stable, make that path an explicit
  public package API instead of leaving an old module behind.
- Make ownership boundaries explicit: view composition, serializers,
  services/read models, and storage workflows should each live in their
  own module family.
- Improve reviewability by keeping each refactor PR below roughly 20
  files and focused on one domain slice.
- Add a backend file-size guard after the biggest files are split so
  new debt does not grow silently.

## Non-Goals

- Do not redesign API response contracts as part of this plan. Envelope
  migration is tracked separately in `docs/plans/api-envelope-migration.md`.
- Do not rewrite business logic while moving code unless a regression is
  already known and covered by a focused test.
- Do not split Django models first. Model package conversion has higher
  migration/import risk and should come after lower-risk modules.
- Do not perform broad formatting-only rewrites.

## Target Architecture

### Contest serializers

Current:

```text
backend/apps/contests/serializers.py
```

Target:

```text
backend/apps/contests/serializers/
  __init__.py
  contest.py
  problem.py
  exam_question.py
  exam_answer.py
  exam_event.py
  evidence.py
  participant.py
  announcement.py
```

Migration rule:

- `serializers/__init__.py` is the package public API, not a temporary
  compatibility file. Keep only serializer names that are still intended
  to be public after import migration.
- Internal imports should move to the concrete serializer module when
  that makes ownership clearer.

### Contest viewset composition

Current:

```text
backend/apps/contests/views/contest.py
```

Target:

```text
backend/apps/contests/views/contest.py                 # composition root
backend/apps/contests/views/contest_lifecycle.py       # publish/archive/delete/toggle
backend/apps/contests/views/contest_registration.py    # register/enter/leave/classroom gate
backend/apps/contests/views/contest_participants.py    # roster/update/remove/unlock/reopen
backend/apps/contests/views/contest_overview.py        # overview metrics/dashboard summary
backend/apps/contests/views/contest_reports.py         # downloads/my report/participant report
```

Migration rule:

- `ContestViewSet` remains the router-visible class.
- New files provide mixins only; URL names and action names must not
  change.
- Any moved helper that is domain logic should go to `services/`, not
  another view mixin.

### Participant dashboard read model

Current:

```text
backend/apps/contests/services/participant_dashboard.py
```

Target:

```text
backend/apps/contests/services/participant_dashboard/
  __init__.py
  builder.py
  paper_report.py
  coding_report.py
  timeline.py
  event_feed.py
  evidence_metadata.py
```

Migration rule:

- `build_participant_dashboard()` remains importable from
  `apps.contests.services.participant_dashboard`.
- Evidence metadata merge helpers stay service-private unless another
  module has a clear runtime need.

### Question bank assets

Current:

```text
backend/apps/question_bank/question_assets.py
```

Target:

```text
backend/apps/question_bank/assets/
  __init__.py
  payloads.py
  publish.py
  sync_exam_question.py
  coding_content.py
  membership.py
  cleanup.py
```

Migration rule:

- Migrate runtime imports in the same change and remove
  `question_assets.py`; do not leave a compatibility facade.
- Asset payload construction must stay separate from persistence /
  publishing workflows.

### AI run runtime

Current:

```text
backend/apps/ai/services/run_runtime.py
```

Target:

```text
backend/apps/ai/services/run_runtime/
  __init__.py
  lifecycle.py
  executor.py
  stream_parser.py
  event_reducer.py
  metadata.py
  usage.py
```

Migration rule:

- Keep public functions such as `create_chat_run`, `dispatch_run`,
  `execute_run`, `request_run_cancel`, `record_event`, and
  `apply_event_to_run` importable from `apps.ai.services.run_runtime`.
- Do not change Celery task call signatures during the split.

### Users views

Completed state:

Removed:

```text
backend/apps/users/views/_impl.py
backend/apps/users/views/profile.py
```

Current:

```text
backend/apps/users/views/
  account.py
  preferences.py
  avatar.py
  password.py
  login_records.py
  admin.py
```

Migration rule:

- URL wiring remains stable.
- Keep view class names stable for schema generation.
- Do not keep `_impl.py` or `profile.py` as compatibility facades.

## Work Plan

### Phase 0 — Baseline and guardrails

**Goal:** capture current behavior before moving code.

- [ ] Add `scripts/backend_file_size_report.py` or a pytest-based
  architecture helper that lists production `.py` files over the target
  threshold.
- [ ] Exclude `migrations`, generated files, and vendored directories.
- [ ] Add a non-blocking report to CI or document the command in this
  plan.
- [ ] Confirm current focused backend tests for affected domains:
  - contests serializers/viewset actions
  - exam answer APIs
  - participant dashboard API
  - question bank API/assets
  - AI run runtime
  - users account endpoints

**Acceptance:**

- A repeatable command prints the current top large backend files.
- No production behavior is changed in this phase.

### Phase 1 — Split contest serializers

**Goal:** move serializer families without changing API output.

- [ ] Create `backend/apps/contests/serializers/` package.
- [ ] Move serializer groups by resource:
  - contests list/detail/create/update
  - contest problems
  - exam questions
  - exam answers/grading
  - exam events/evidence
  - participants/activity
  - announcements/clarifications
- [ ] Re-export every existing public class from `serializers/__init__.py`.
- [ ] Replace intra-backend imports only when it reduces ambiguity.
- [ ] Add or update import smoke tests to ensure old import paths still
  work.

**Acceptance:**

- `backend/apps/contests/serializers.py` is removed and replaced by the
  `serializers/` package.
- Existing API responses remain byte-shape compatible except for field
  ordering.
- Focused tests pass:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/exam apps/contests/tests/management/test_contest_viewset_actions.py
```

### Phase 2 — Split `ContestViewSet`

**Goal:** turn `views/contest.py` into a composition root.

- [ ] Extract registration and classroom-bound participation logic to
  `views/contest_registration.py`.
- [ ] Extract publish/archive/delete/toggle actions to
  `views/contest_lifecycle.py`.
- [ ] Extract participant roster mutation and status actions to
  `views/contest_participants.py`.
- [ ] Extract overview/dashboard action code to
  `views/contest_overview.py`.
- [ ] Extract report/download actions to `views/contest_reports.py`.
- [ ] Move reusable non-HTTP logic from view helpers to `services/`.
- [ ] Ensure action names, route names, and response status codes stay
  unchanged.

**Acceptance:**

- `backend/apps/contests/views/contest.py` contains mostly
  `ContestViewSet` composition, queryset/serializer selection, and
  permission wiring.
- Existing route names still resolve.
- Focused tests pass:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/participation/test_participation.py \
            apps/contests/tests/management/test_contest_viewset_actions.py \
            apps/contests/tests/test_participant_dashboard_api.py
```

### Phase 3 — Split participant dashboard service

**Goal:** isolate dashboard read-model construction.

- [ ] Move paper exam report assembly to `paper_report.py`.
- [ ] Move coding contest report assembly to `coding_report.py`.
- [ ] Move timeline serialization to `timeline.py`.
- [ ] Move event feed grouping/metadata merge to `event_feed.py` and
  `evidence_metadata.py`.
- [ ] Keep `build_participant_dashboard()` as the only public entrypoint
  unless another caller needs a narrower read model.

**Acceptance:**

- `participant_dashboard` package has one clear public builder.
- Evidence metadata tests cover grouped clipboard and evidence cases.
- Focused tests pass:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/test_participant_dashboard_api.py
```

### Phase 4 — Split exam answer viewset

**Goal:** reduce `views/exam_answer.py` by separating student, grading,
summary, and submission flows.

- [ ] Extract student-facing answer retrieval and save flows.
- [ ] Extract grading projection and batch update flows.
- [ ] Extract dashboard summary/read-model actions.
- [ ] Extract submission validation orchestration if it remains view-heavy.
- [ ] Keep the router-visible `ExamAnswerViewSet` stable.

**Acceptance:**

- `ExamAnswerViewSet` remains import-compatible and route-compatible.
- API envelope migration status is not changed accidentally.
- Focused tests pass:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/exam/test_exam_answers.py \
            apps/contests/tests/test_exam_service_boundaries.py
```

### Phase 5 — Split question bank asset workflow

**Goal:** make asset workflow boundaries explicit.

- [ ] Extract payload builders.
- [ ] Extract version publish/create helpers.
- [ ] Extract exam-question sync helpers.
- [ ] Extract coding content write helpers.
- [ ] Extract membership and cleanup helpers.
- [ ] Migrate imports directly and remove `question_assets.py`; do not
  keep a compatibility facade.

**Acceptance:**

- Asset payload construction can be unit-tested without persistence
  side effects.
- Existing question bank API behavior remains stable.
- Focused tests pass:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/question_bank/tests/test_api.py \
            apps/question_bank/tests/test_question_asset_integration.py
```

### Phase 6 — Split AI run runtime

**Goal:** isolate lifecycle, executor, streaming, event reducer, and
metadata concerns.

- [ ] Move create/dispatch/cancel/resume functions to `lifecycle.py`.
- [ ] Move `execute_run` and external service orchestration to
  `executor.py`.
- [ ] Move SSE parsing to `stream_parser.py`.
- [ ] Move event application to `event_reducer.py`.
- [ ] Move assistant metadata helpers to `metadata.py`.
- [ ] Move token/usage accounting to `usage.py`.

**Acceptance:**

- Celery tasks and public imports continue to work.
- Failed/cancelled/completed run transitions remain covered.
- Focused tests pass:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/ai/tests/test_durable_runs.py apps/ai/tests/test_artifacts_api.py
```

### Phase 7 — Split users view implementation

**Goal:** replace `_impl.py` with endpoint-specific modules.

- [x] Move current user/search/role/stats endpoints to `admin.py` or
  `account.py` based on permission boundary.
- [x] Move preferences endpoint to `preferences.py`.
- [x] Move avatar upload endpoint to `avatar.py`.
- [x] Move password reset/change endpoints to `password.py`.
- [x] Move login records/logout-other-devices endpoints to
  `login_records.py`.
- [x] Preserve URL imports and schema names.

**Acceptance:**

- `_impl.py` is removed with no compatibility facade.
- Profile/account view imports are wired directly to endpoint-specific
  modules.
- User/account tests pass:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/users/tests
```

### Phase 8 — Backend file-size guard

**Goal:** prevent new large-file debt after the split.

- [ ] Add an architecture test that fails when production backend files
  exceed an agreed threshold.
- [ ] Recommended starting thresholds:
  - production code: hard fail over 900 lines
  - production code: warning/report over 600 lines
  - tests: hard fail over 1400 lines
  - tests: warning/report over 1000 lines
- [ ] Add an allowlist with explicit reasons and review dates.
- [ ] Document how to update the allowlist when a temporary exception is
  approved.

**Acceptance:**

- The guard fails on newly introduced oversized files.
- Existing allowlist is small and tied to follow-up phases.

## PR Strategy

- One PR per phase, or one PR per file family inside a phase if the diff
  exceeds reviewable size.
- Prefer pure move/refactor PRs with no behavior change.
- If behavior must change, add a failing regression test first and state
  the behavior change in the PR description.
- Avoid compatibility facades for app-internal refactors. External import
  stability must be handled as an explicit public package API, not as an
  old-file shim.

## Verification Matrix

Run the narrowest relevant tests per phase, then run broader affected
apps before merging a large phase.

| Phase | Minimum checks |
|---|---|
| 1 | contests exam/management tests, import smoke tests |
| 2 | participation, management viewset actions, participant dashboard API |
| 3 | participant dashboard API, event/evidence metadata tests |
| 4 | exam answers, service boundary tests |
| 5 | question bank API and asset integration tests |
| 6 | AI durable run/artifact tests |
| 7 | users tests |
| 8 | architecture guard test |

Standard commands:

```bash
git diff --check
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q <focused paths>
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test python manage.py makemigrations --check --dry-run
```

## Risks

- **Import churn:** avoid by migrating runtime imports in the same PR and
  keeping router-visible class names stable.
- **Django model package risk:** defer model splitting until serializers,
  views, and services are stable.
- **Route/schema drift:** keep router-visible class names and action
  method names unchanged.
- **Hidden behavior changes:** for pure refactors, compare focused API
  tests before and after.
- **Large test modules hiding unrelated failures:** split tests after
  production code or in separate PRs to keep signal clear.

## Expected Outcomes

| Outcome | Target |
|---|---|
| `contests/serializers` ownership | Serializer families split by resource |
| `ContestViewSet` role | Composition root instead of action warehouse |
| Participant dashboard service | Public builder with separate paper/coding/timeline/event modules |
| Question asset workflow | Payload, publish, sync, membership, cleanup isolated |
| AI runtime | Lifecycle/executor/SSE/event reducer separated |
| File-size guard | CI-visible backend oversized-file check |
| Review quality | Smaller PRs with lower merge-conflict risk |

## Results Log

Use this section to record completed phases.

| Date | Phase | PR / commit | Result | Notes |
|---|---|---|---|---|
| 2026-05-09 | Baseline scan | local scan | Proposed plan created | Largest production file: `contests/serializers.py` at 1239 lines |
| 2026-05-09 | Phase 7 | local implementation | Users view implementation split | `_impl.py` and `profile.py` removed; focused users tests pass |
| 2026-05-10 | Boundary cleanup | local implementation | Exam service HTTP boundary reduced | Domain service no longer constructs DRF `Response`; view adapter tests added |
| 2026-05-10 | Dead-code cleanup | local implementation | Detail cache and judge shims removed | Removed write-only contest detail cache helper and obsolete judge compatibility modules |
| 2026-05-10 | Naming cleanup | local implementation | Problem and contest role aliases removed | Migrated `Problem` alias to `CodingProblem`; removed `get_user_role_in_contest()` legacy mapping |
| 2026-05-10 | Current scan refresh | local scan | Large-file baseline updated | Largest production file is now `contests/serializers.py` at 1226 lines |

## Open Questions

- Should backend file-size guard be a pytest architecture test or a
  standalone script invoked by CI?
- Should tests get a separate split plan, or be split opportunistically
  with the production module they cover?
- What threshold should become hard fail after the initial cleanup:
  900 lines, 800 lines, or 700 lines?
- Should `contests/models.py` remain a single Django model module until
  the next schema-heavy milestone is complete?
