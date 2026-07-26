# Integrity Worker Restart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give teachers one safe Worker restart action only while the current running run is unhealthy.

**Architecture:** The controller performs a narrow restart of an already owned container. Backend lifecycle service serializes and reconciles that operation, while the frontend replaces general lifecycle controls with status-only presentation plus conditional recovery.

**Tech Stack:** Docker SDK, FastAPI/Pydantic, Django/DRF, React/Carbon, pytest, Vitest.

## Global Constraints

- Restart preserves run ID, token, policy/registry snapshots, data volume, PostgreSQL rows, and R2 evidence.
- Restart is allowed only for `compute_state=running` and `health=unhealthy`.
- Missing or ownership-mismatched containers are rejected; this feature does not rebuild them.
- Healthy teachers see no lifecycle actions.

---

### Task 1: Add controller restart primitive

**Files:**
- Modify: `integrity-service/integrity_service/controller/docker_runtime.py`
- Modify: `integrity-service/integrity_service/controller/schemas.py`
- Modify: `integrity-service/integrity_service/controller/app.py`
- Test: `integrity-service/tests/test_docker_runtime.py`

**Interfaces:**
- Produces: `DockerRuntime.restart(run_id: UUID) -> StartResult` and `POST /v1/runs/{run_id}/restart` returning `StartRunResponse`.

- [ ] **Step 1: Add runtime tests**

Assert running containers call `restart(timeout=30)`, exited/created containers call `start()`, and absent/foreign containers raise a controller conflict.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd integrity-service && pytest tests/test_docker_runtime.py -q`

- [ ] **Step 3: Implement `restart()` and route**

Reuse `_validate_owned_container()` and `_start_result()`. Read the existing token digest from validated labels; never accept a new token in this endpoint.

- [ ] **Step 4: Run controller tests**

Run: `cd integrity-service && pytest tests/test_docker_runtime.py tests/test_controller_api.py -q`

- [ ] **Step 5: Commit**

```bash
git add integrity-service/integrity_service/controller integrity-service/tests/test_docker_runtime.py
git commit -m "feat: add safe integrity worker restart"
```

### Task 2: Add Backend reconciliation endpoint

**Files:**
- Modify: `backend/apps/contests/infrastructure/integrity_controller_client.py`
- Modify: `backend/apps/contests/services/integrity_runs.py`
- Modify: `backend/apps/contests/views/integrity_runs.py`
- Test: `backend/apps/contests/tests/integrity/test_run_lifecycle.py`

**Interfaces:**
- Produces: `restart_run(run_id, *, controller=None) -> ExamIntegrityRun` and manager action `POST .../integrity-runs/{run_id}/restart/`.

- [ ] **Step 1: Add lifecycle tests**

Assert invalid transition for healthy/stopped runs, one controller restart for unhealthy running, strict post-restart status reconciliation, health reset only after a match, and stable unhealthy state after failure.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/integrity/test_run_lifecycle.py -q`

- [ ] **Step 3: Add client and serialized service operation**

Extend `ControllerClient` and `IntegrityControllerClient` with `restart(run_id)`. Reuse `_serialized_run_operation`, `_read_controller_status`, and `_status_matches_container`; add a fixed safe error code `controller_restart_reconciliation_failed`.

- [ ] **Step 4: Add the DRF action**

Route through `_transition_response(lambda: restart_run(run.id))`; preserve existing permissions.

- [ ] **Step 5: Run lifecycle/API tests**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/integrity/test_run_lifecycle.py -q`

- [ ] **Step 6: Commit**

```bash
git add backend/apps/contests/infrastructure/integrity_controller_client.py backend/apps/contests/services/integrity_runs.py backend/apps/contests/views/integrity_runs.py backend/apps/contests/tests/integrity/test_run_lifecycle.py
git commit -m "feat: reconcile integrity worker restart"
```

### Task 3: Replace manual lifecycle UI with conditional recovery

**Files:**
- Modify: `frontend/src/core/entities/examIntegrity.entity.ts`
- Modify: `frontend/src/infrastructure/api/repositories/examIntegrity.repository.ts`
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.tsx`
- Modify: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.module.scss`
- Test: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.test.tsx`
- Modify: `frontend/src/i18n/locales/{zh-TW,en,ja,ko}/contest.json`

**Interfaces:**
- Consumes: `restartRun(contestId, runId)`.
- Produces: status-only card; unhealthy running state shows one confirmed `重新啟動 Worker` action.

- [ ] **Step 1: Replace lifecycle-action tests**

Assert healthy run has no action, unhealthy running run has restart, stopped/destroyed/purged states have no teacher action, confirmation can cancel, and success/error toasts are correct.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd frontend && npm test -- --run src/features/contest/components/admin/IntegrityRunControlCard.test.tsx`

- [ ] **Step 3: Add repository method and simplify card state**

Remove create/start/stop/destroy/purge action branches and purge text-entry state. Keep status, error/warning text, refresh, and a single `restart` busy state.

- [ ] **Step 4: Implement compact Carbon confirmation**

Use the existing confirmation modal primitive. Copy: `重新啟動期間事件可能短暫重試；既有事件與證據不會刪除。`

- [ ] **Step 5: Run tests and typecheck**

Run: `cd frontend && npm test -- --run src/features/contest/components/admin/IntegrityRunControlCard.test.tsx src/features/contest/components/admin/settings/ContestSettingsModal.test.tsx && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/entities/examIntegrity.entity.ts frontend/src/infrastructure/api/repositories/examIntegrity.repository.ts frontend/src/features/contest/components/admin/IntegrityRunControlCard* frontend/src/i18n/locales
git commit -m "feat: show worker restart only for unhealthy runs"
```

### Task 4: Compose and smoke verification

**Files:**
- Modify only if required: `docker-compose.dev.yml`, controller/Worker Dockerfiles.
- Test: `integrity-service/tests/test_compose_contract.py`

**Interfaces:**
- Produces: a rebuilt controller image exposing restart and a frontend/backend combination using it.

- [ ] **Step 1: Remove duplicate compose security option if still present**

Validate with `docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q`.

- [ ] **Step 2: Run focused automated suites**

Run controller, Backend lifecycle, frontend card, and compose contract tests from Tasks 1–3.

- [ ] **Step 3: Rebuild affected services**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build integrity-controller backend frontend`

- [ ] **Step 4: Smoke the conditional action**

Confirm healthy status has no button; mark or induce an unhealthy run in local test data, restart, and verify the same run ID and retained evidence remain.

- [ ] **Step 5: Commit any compose-only correction**

```bash
git add docker-compose.dev.yml integrity-service/tests/test_compose_contract.py
git commit -m "fix: validate integrity restart compose contract"
```
