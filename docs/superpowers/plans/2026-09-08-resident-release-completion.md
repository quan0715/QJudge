# Resident completion and release

## Current authority

The user confirmed on 2026-09-08 that Resident replaces legacy directly. Do not
create backups, parallel legacy/resident operation, fallback routing, or new
compatibility layers. Earlier migration/coexistence directions in the September
7 plan are superseded. Normal exam records and evidence retention remain part
of the product; do not confuse those with migration backups.

Finish and verify the complete Resident plan, consolidate existing local work
into origin/dev, wait for dev CI to pass, then open dev -> main and merge only
after the PR CI passes. Do not commit directly to main or bypass required checks.

## Completion gates

- [x] Legacy retirement is complete across runtime, model, callers, migrations,
      tests, Compose, CI and operational documentation.
- [x] Immediate monitored exam start and runtime-state work in the running app.
- [x] Browser events reach Resident and appear in the management event list,
      including after submission and an explicitly reopened attempt.
- [x] Students can answer, save and submit during a monitoring outage; recovery
      does not duplicate actions or punish students for a platform outage.
- [x] Saving an extended end time updates the student countdown and backend
      deadline without resetting answers; stale deadline/finalization work
      cannot undo the extension. Submitted attempts do not reopen implicitly.
- [x] Post-submission uploads stop collection, finish pending evidence, and
      preserve truthful complete/pending/missing status through finalization.
- [x] Two simultaneous exams remain isolated, including while one is stalled
      (automated resident tests).
- [x] Teacher UI has no Worker management requirement; duplicate return entry
      verified in the browser, evidence deduplication covered by component tests.
- [x] Relevant tests, typecheck, architecture/naming checks and Compose checks
      pass against the integrated source. Record any remaining acceptance gaps.
- [x] Inventory local branches and worktrees; integrate unique intended work,
      and remove obsolete branch refs only after confirming their work is kept.
- [ ] Push integrated dev, verify CI for that exact commit.
- [ ] Open dev -> main PR, verify PR CI, merge and verify remote main.

## Initial inventory (2026-09-08)

Remote dev: 8ffd3437. Remote main: 36dcb493. No open PRs at inspection.
Current checkout: codex/contest-preparation-overview at 034a4f30, with mixed
uncommitted work and an ongoing legacy retirement in another session.

The local dev branch has two test-case-editor commits not in remote dev; the
current feature branch already contains those. The resident-integrity branch
contains the main Resident implementation commits; much of that content exists
as uncommitted/untracked files in the current checkout. Git diff alone does not
include those untracked files and is not a reliable removal inventory.

Other non-ancestor branches need patch-equivalence and worktree checks before
deciding whether they contain unique intended changes: api-contract-envelope,
auth-campus-registration-filter, auth-experience-refresh,
integrity-worker-bootstrap-header, local-main-before-sync-20260822, and
score-precision. Do not blindly merge old snapshot branches.

## Integrated verification (2026-09-08, pre-release)

- Linux Compose backend: 1382 passed, with explicit judge app and performance
  exclusions. Fixed historical migration-test teardown restoring the current schema.
- Resident service: 357 passed, including rendered Compose contracts and Linux
  UID/GID checks. Two upstream deprecation warnings, no failures or skips.
- Frontend: 1115 passed, one skipped; typecheck/build, naming, architecture,
  repository-export and Carbon gates pass. Preparation-dialog assertions now
  follow the existing three-step review flow.
- Fresh-account Resident browser E2E passed: start within 15 seconds, entry,
  clipboard, extension, checkpoint outage, save, submit, recovery/drain, explicit
  reopen, new entry and second submission. No stale connectivity penalty.
  Both paper and coding classroom-create E2Es also pass.
- Production deployment contract tests: 38 passed. Deployment, Makefile and
  troubleshooting now reference Resident rather than deleted services. CI uses
  the Linux unit-test image for credential ownership tests.
- Browser dev: answering and saving survived checkpoint 503; submission returned
  200, then recovery reached received/processed/final sequence 67 and complete.
  Reopening preserved the answer. Return-to-contest appears once in the rendered
  paper-exam sidebar.
- Rejoin defect isolated: reset incident/connectivity detectors at authenticated
  attempt boundaries, preserve sequence and replay. Post-submit drain receipts
  no longer restart connectivity tracking. Same-attempt timeout remains tested.
- Entry-event initialization race fixed at the real screen/provider boundary:
  capture admission gates only event emission, never answering. New owner scope
  cannot send through a completed attempt. Actual dev entry 68259 was projected.
- Normal entry/submission records no longer increment penalties. Frozen registry
  policy remains authoritative for genuine violations and submit actions.
- Removed the final no-op auto_submit Worker command; backend deadline sweeping
  and real registry submit actions remain covered.
- Purge releases retired registry capacity as well as journal/storage data;
  repeated purge cannot exhaust the next exam's admission slot.
- Imported the secure internal callback header from local branch bdb9ab96 into
  the Resident credential client; presigned storage uploads remain isolated.
- Current dev Resident is healthy; the legacy controller container was removed
  without removing databases or volumes. Historical test losses remain visible.
- Removed 16 obsolete local branch refs after ancestry/patch-equivalence checks.
  Active worktrees and unrelated unique work remain intact. In particular the
  old local-main snapshot contains independent judge/AI changes, not a branch
  to merge wholesale into this release.
- Two-exam isolation, stalled-finalization isolation, deadline-race handling and
  evidence deduplication are covered by automated tests. Rendered dev acceptance
  covered the paper sidebar and answering flow; no new production load test or
  OS-native capture-permission test was performed.
- Dev push, exact-SHA CI and main PR/merge remain release gates.
