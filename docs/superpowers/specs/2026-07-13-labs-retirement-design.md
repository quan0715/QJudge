# Labs Retirement Design

## Decision

Retire `backend/apps/labs` in one controlled release. The only deployed
database is the production service on `quan338.tailc351c1.ts.net`; local dev
is the other migration target.

The release replaces the historical `labs` migration node with current-schema
baselines for the apps whose historical migrations reference it. It does not
change current runtime domain behavior.

## Current Constraint

The Labs models were deleted by `labs.0003`, but Django still loads the app
because these historical paths reference it:

- `classrooms.0001_initial` and `classrooms.0002_delete_classroomlab`
- `submissions.0012_submission_lab` through `submissions.0014_remove_submission_lab`
- the `labs.0001` through `labs.0003` migration chain

Removing only the app directory or `INSTALLED_APPS` leaves an invalid
migration graph for a new database.

## Chosen Migration Strategy

Create a replacement squashed baseline for `classrooms` and two dependency-safe
replacement ranges for `submissions`. The submissions history must retain
`0001_initial` and `0016_submission_contest_question_binding`; squashing either
edge into the middle range creates a cycle through the historical `problems`,
`contests`, and `question_bank` dependencies. The replacement ranges are
`0002` through `0011` and `0012` through `0015`. None may depend on `labs`.

After verification, remove the replaced migration files, `apps.labs`, and the
`INSTALLED_APPS` entry. Existing databases retain the old migration records;
Django recognises those records through the replacement migration's `replaces`
metadata and treats the baseline as applied. New databases apply only the
replacement baseline and therefore never require Labs.

The replacement files must be reviewed manually. Automatically generated
squashes are only a starting point because historical data migrations and
cross-app dependencies need explicit inspection.

## Verification Record

Verified locally on 2026-07-13:

- Fresh PostgreSQL database: `migrate --noinput` completed with no Labs app;
  the resulting graph contains the classroom replacement, submissions `0001`,
  the two submissions replacements, and `0016`.
- Production snapshot: `scripts/db/refresh_local_from_prod.sh --env dev --yes
  --skip-build --remote quan338.tailc351c1.ts.net` restored production into the
  local dev database and completed `migrate`. The snapshot migration plan had
  no Labs operation.
- Migration checks: `migrate --plan` reported no pending operation and
  `makemigrations --check --dry-run` reported no model change.
- Targeted backend tests: `174 passed, 1 skipped`.

The full backend suite has one unrelated flaky C++ judge integration assertion:
`CppIntegrationTests.test_time_measured` measures Docker lifecycle time,
including compilation and container scheduling, against a 2.5-second ceiling.
Three isolated reruns produced two passes and one 2631ms failure. The Labs
release does not modify judge code; this remains a separate test-stability
follow-up. With that test and the three pre-existing Java runtime tests
deselected, the full backend suite passed: `1198 passed, 2 skipped, 4
deselected`.

## Scope

Included:

- Squashed current-schema migration baselines for `classrooms` and
  `submissions`.
- Removal of all Labs application files, migration files, settings references,
  comments, and stale product copy that describes Labs as a runtime mode.
- Contract tests proving the app and migration dependencies no longer exist.
- Fresh-database and production-snapshot migration verification.
- Deployment backup, smoke test, and rollback procedure.

Excluded:

- Subscription retirement.
- Realtime SFU and anti-cheat compatibility cleanup.
- Contest feature refactoring beyond references needed to remove Labs.

## Verification Matrix

| Target | Starting state | Required result |
| --- | --- | --- |
| Fresh database | Empty PostgreSQL database | `migrate --noinput` completes; `showmigrations` has no Labs app. |
| Existing schema | Copy of the production database and migration recorder | `migrate --plan` has no unexpected destructive operation; `migrate --noinput` completes. |
| Dev runtime | Current dev compose database | Backend health and core classroom/submission paths remain available. |
| Test suite | Test compose database | Migration checks plus classroom, submission, problem, and full backend tests pass. |

The fresh and snapshot checks are release gates, not optional smoke tests.

## Deployment and Rollback

1. Put the production service into a maintenance window and create a verified
   PostgreSQL backup before any migration command.
2. Deploy the release image and run `python manage.py migrate --plan`; stop if
   it contains an unexpected schema operation.
3. Run `python manage.py migrate --noinput`, then verify `/api/health/` and
   classroom/submission read paths with an authenticated smoke test.
4. If migration or smoke verification fails, stop application startup and
   restore the pre-deploy database backup before returning traffic.

The code rollback artifact remains the previous deployed image. A database
restore is required only if the migration changes schema or migration state in
a way the previous image cannot consume.

## Acceptance Criteria

- `rg 'apps\\.labs|labs\\.lab|\\("labs"' backend` finds no active source or
  migration dependency.
- `apps.labs` is absent from `INSTALLED_APPS` and `showmigrations`.
- `makemigrations --check --dry-run` passes.
- Both the fresh and production-snapshot migration paths pass.
- Relevant targeted tests and the backend suite pass.
- GitHub Issue #200 is closed only after production smoke verification.
