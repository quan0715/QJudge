# Resident runtime cleanup

Work in the current /Users/quan/online_judge checkout. Only own integrity-service/
(exclude scripts/bootstrap_integrity_secrets.py and Compose). Retire dead legacy
WorkerRuntime ingest/tick/stop/begin_stop and scheduler loop, resident_mode flag,
and branching kept solely for legacy. Resident uses accept_batch/process_pending
and resident/lifecycle.py. Keep durable receipt replay, late_unverified ordering,
per-run isolation, evidence fences and command delivery behavior correct. Migrate
meaningful engine tests to real resident entry points instead of deleting their
behavior coverage. Remove tests only when they exclusively test retired behavior.
No legacy fallback, backup or coexistence. Preserve all prior dirty edits. Do not
stash, reset, commit or spawn subagents; root will commit the combined work.

Run tests inside Compose using:
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps
-v /Users/quan/online_judge:/workspace:ro -w /workspace/integrity-service
integrity-unit-test python -m pytest -o addopts='' -q -p no:cacheprovider

Focused tests while iterating, full integrity suite once at completion. Report
to docs/superpowers/plans/resident-runtime-cleanup-report.md with exact commands,
results, coverage preserved and any issues. Main handles frontend/backend/E2E.
