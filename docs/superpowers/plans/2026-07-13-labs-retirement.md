# Labs Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy Labs Django app and all migration-graph dependencies while preserving both fresh-database setup and existing-database upgrades.

**Architecture:** Replace the `classrooms` history with one reviewed squash baseline. For `submissions`, retain `0001_initial` and `0016_submission_contest_question_binding`, then squash `0002` through `0011` and `0012` through `0015` separately; this preserves the historical cross-app ordering while removing every Labs dependency. Existing databases retain their historical rows in `django_migrations`; Django recognizes the replacement migrations as applied. New databases apply the retained and replacement migrations without requiring Labs.

**Tech Stack:** Django 4.2 migrations, PostgreSQL 15, Docker Compose, pytest, GitHub Actions.

## Global Constraints

- Do not change runtime classroom, submission, contest, SFU, or anti-cheat behavior.
- Do not retain `apps.labs`, a Labs migration stub, or a fallback migration node after the change.
- Do not modify the user's Copilot design and plan files.
- Treat fresh-database migration and a restored production snapshot as independent release gates.
- Do not deploy to production or close Issue #200 without explicit deployment approval after local verification.

---

### Task 1: Add Labs-retirement migration contracts

**Files:**
- Create: `backend/tests/test_labs_retirement.py`

**Interfaces:**
- Consumes: `django.conf.settings`, `django.db.connection`, `django.db.migrations.loader.MigrationLoader`.
- Produces: tests that fail while `apps.labs` or any `labs` migration graph node remains.

- [x] **Step 1: Write the failing test**

```python
from django.conf import settings
from django.db import connection
from django.db.migrations.loader import MigrationLoader


def test_labs_app_and_migration_nodes_are_removed():
    loader = MigrationLoader(connection, ignore_no_migrations=True)

    assert "apps.labs" not in settings.INSTALLED_APPS
    assert not any(app_label == "labs" for app_label, _ in loader.graph.nodes)
    assert not any(
        dependency[0] == "labs"
        for migration in loader.disk_migrations.values()
        for dependency in migration.dependencies
    )
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest tests/test_labs_retirement.py -q
```

Expected: failure because `apps.labs` is installed and the migration graph contains `labs` nodes.

- [x] **Step 3: Keep this test unchanged while replacing the migration graph**

The test is the end-state contract. Do not weaken it to allow a migration-only Labs app.

### Task 2: Generate and review replacement migration baselines

**Files:**
- Create: `backend/apps/classrooms/migrations/0001_initial_squashed_0008_drop_legacy_email_notifications.py`
- Create: `backend/apps/submissions/migrations/0002_initial_squashed_0011_alter_submission_status.py`
- Create: `backend/apps/submissions/migrations/0012_squashed_0015_remove_legacy_submission_fields.py`
- Delete: `backend/apps/classrooms/migrations/0001_initial.py` through `0008_drop_legacy_email_notifications.py`
- Delete: `backend/apps/submissions/migrations/0002_initial.py` through `0015_remove_submission_sub_lab_created_idx.py`

**Interfaces:**
- Consumes: current `Classroom`, `ClassroomMember`, `ClassroomContest`, `ClassroomAnnouncement`, `Submission`, `SubmissionResult`, and `ScreenEvent` models.
- Produces: three replacement migrations with `replaces` declarations for the deleted migration ranges and no `labs` dependency.

- [x] **Step 1: Generate candidate squashes without modifying models**

Run inside the dev backend container:

```bash
python manage.py squashmigrations classrooms 0001 0008 --noinput
python manage.py squashmigrations submissions 0002 0011 --noinput
python manage.py squashmigrations submissions 0012 0015 --noinput
```

- [x] **Step 2: Verify the generated operations cancel Labs-only history**

The classroom replacement must not create `ClassroomLab`, and the submission replacement must not add a `Submission.lab` field or `sub_lab_created_idx` index. Its `dependencies` must contain no `("labs", ...)` entry.

```python
class Migration(migrations.Migration):
    initial = True
    replaces = [
        ("classrooms", "0001_initial"),
        ("classrooms", "0002_delete_classroomlab"),
        ("classrooms", "0003_classroomannouncement"),
        ("classrooms", "0004_classroom_uuid"),
        ("classrooms", "0005_classroom_icon_cover_url"),
        ("classrooms", "0006_alter_classroom_icon"),
        ("classrooms", "0007_cleanup_reserved_memberships"),
        ("classrooms", "0008_drop_legacy_email_notifications"),
    ]
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("contests", "0032_add_exam_answer_and_results_published"),
    ]
```

The submissions sequence keeps `0001_initial` and `0016_submission_contest_question_binding` in place. The first replacement covers `0002` through `0011`; the second covers `0012` through `0015`. The second replacement retains the historical UUID cutover data migration but removes the transient `Submission.lab` field and `sub_lab_created_idx` operations. Both replacement files omit a Labs dependency.

- [x] **Step 3: Delete the superseded migration files only after all replacement files exist**

Keep `__init__.py` in both migration packages. Do not delete migration files from unrelated apps.

- [x] **Step 4: Verify Django sees replacement histories**

Run:

```bash
python manage.py makemigrations --check --dry-run
python manage.py showmigrations classrooms submissions
```

Expected: no proposed model migration; the migration graph contains only the retained and replacement migration sequence.

### Task 3: Remove Labs runtime and migration source

**Files:**
- Modify: `backend/config/settings/base.py`
- Delete: `backend/apps/labs/__init__.py`
- Delete: `backend/apps/labs/apps.py`
- Delete: `backend/apps/labs/migrations/__init__.py`
- Delete: `backend/apps/labs/migrations/0001_initial.py`
- Delete: `backend/apps/labs/migrations/0002_labproblem_problem_uuid.py`
- Delete: `backend/apps/labs/migrations/0003_delete_legacy_lab_models.py`
- Modify: `frontend/src/i18n/locales/{en,ja,ko,zh-TW}/landing.json` only if the copy presents Labs as an available runtime product.

**Interfaces:**
- Consumes: replacement migration baselines from Task 2.
- Produces: no `apps.labs` application or `labs` migration dependency in the repository.

- [x] **Step 1: Remove the failing runtime configuration**

Delete this entry from `INSTALLED_APPS`:

```python
"apps.labs",  # migration stub only; runtime lab product now uses contests
```

- [x] **Step 2: Delete the complete Labs app directory**

Delete the seven tracked Labs files listed above. Do not leave an empty package or a migration-only fallback.

- [x] **Step 3: Remove stale active-product copy only**

Keep historical or conceptual documentation that does not claim Labs is a runnable feature. Remove or reword landing-page copy only where it markets a non-existent Labs mode.

- [x] **Step 4: Run the Labs contract test to verify it passes**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest tests/test_labs_retirement.py -q
```

Expected: `1 passed`.

### Task 4: Verify both migration entry points

**Files:**
- Test: `backend/tests/test_labs_retirement.py`
- Use: `scripts/db/refresh_local_from_prod.sh`

**Interfaces:**
- Consumes: fresh PostgreSQL database, restored production snapshot, and replacement migration baselines.
- Produces: evidence that fresh install and existing upgrade do not require Labs.

- [x] **Step 1: Verify a fresh PostgreSQL database**

Create a disposable database in the dev PostgreSQL container, migrate it using the backend image, then remove it:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres createdb -U postgres labs_retirement_fresh
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -e DB_NAME=labs_retirement_fresh backend python manage.py migrate --noinput
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -e DB_NAME=labs_retirement_fresh backend python manage.py showmigrations
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres dropdb -U postgres labs_retirement_fresh
```

Expected: migration completes and `showmigrations` contains no Labs app.

- [x] **Step 2: Restore and migrate the production snapshot locally**

Run only after the current local dev database can be replaced:

```bash
scripts/db/refresh_local_from_prod.sh --env dev --yes --skip-build --remote quan338.tailc351c1.ts.net
```

Expected: the script saves a custom-format dump under `artifacts/db_backups`, restores it locally, and completes `python manage.py migrate` with no Labs node required.

- [x] **Step 3: Run migration and backend verification**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py makemigrations --check --dry-run
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest tests/test_labs_retirement.py apps/classrooms/tests apps/submissions/tests apps/problems -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test pytest -q
```

Result: targeted verification passed (`174 passed, 1 skipped`). The full suite had
one unrelated flaky C++ judge lifecycle-timing assertion after three Java runtime
tests were deselected. With all four documented judge-runtime tests deselected,
the full suite passed (`1198 passed, 2 skipped, 4 deselected`); see the design
verification record.

### Task 5: Publish and hand off the release

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-labs-retirement-design.md` only to record verified command results.

**Interfaces:**
- Consumes: completed fresh and snapshot validation evidence.
- Produces: a feature-branch commit and PR targeting `dev`.

- [ ] **Step 1: Commit only Labs-related files**

```bash
git add backend/config/settings/base.py backend/apps/classrooms/migrations backend/apps/submissions/migrations backend/apps/labs backend/tests/test_labs_retirement.py frontend/src/i18n/locales docs/superpowers/specs/2026-07-13-labs-retirement-design.md
git commit -m "refactor: remove legacy labs migration graph"
git push
```

- [ ] **Step 2: Create a PR from `codex/retire-legacy-surfaces` to `dev`**

Include the fresh-database and snapshot verification results in the PR body. Do not include the user's Copilot files.

- [ ] **Step 3: Request production deployment authority before closeout**

After PR merge, request explicit approval before connecting to the production host to deploy, migrate, smoke test, and close Issue #200. The Issue remains open until that release verification occurs.
