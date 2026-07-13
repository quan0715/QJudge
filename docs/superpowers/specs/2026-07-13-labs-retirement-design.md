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

Create replacement squashed baseline migrations for `classrooms` and
`submissions`. Each baseline represents the current model state and declares
the previous migration range in `replaces`; it must contain no dependency on
`labs`.

After verification, remove the replaced migration files, `apps.labs`, and the
`INSTALLED_APPS` entry. Existing databases retain the old migration records;
Django recognises those records through the replacement migration's `replaces`
metadata and treats the baseline as applied. New databases apply only the
replacement baseline and therefore never require Labs.

The replacement files must be reviewed manually. Automatically generated
squashes are only a starting point because historical data migrations and
cross-app dependencies need explicit inspection.

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
