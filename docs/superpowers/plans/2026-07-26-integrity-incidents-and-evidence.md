# Integrity Incidents and Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make grace timing independent of five-second checkpoint delivery, suppress non-escalated sensor noise, and show bounded incident evidence as chronological episodes.

**Architecture:** Browser hooks emit stable state edges, the Worker owns grace escalation, and the Backend owns incident/evidence projection. Raw records remain immutable; manager-facing episodes are derived data. The frontend renders the Backend projection without inventing aggregation rules.

**Tech Stack:** React 19, TypeScript, Vitest, Django/DRF, PostgreSQL, Python 3.11, pytest, FastAPI Worker core.

## Global Constraints

- Browser-origin grace uses client event duration; server-origin connectivity uses Worker time.
- Grace values: mouse 5 s, fullscreen 10 s, multi-display 20 s, screen share 20 s, webcam 20 s, viewport 5 s, connectivity 30 s.
- Evidence window remains five seconds before and five seconds after the incident anchor.
- Triggered/restored-only incidents remain raw audit data but are absent from the default manager feed.
- No legacy evidence fallback and no full-exam video retention.

---

### Task 1: Freeze the approved registry policy

**Files:**
- Modify: `backend/apps/contests/integrity/registry.py`
- Test: `backend/apps/contests/tests/integrity/test_registry.py`

**Interfaces:**
- Produces: `build_registry_snapshot()` with the approved `grace_ms` values and a new registry version.

- [ ] **Step 1: Update the registry contract test**

Assert the exact mapping:

```python
assert {key: item["grace_ms"] for key, item in snapshot["definitions"].items()} == {
    "health_snapshot": 0,
    "connectivity": 30_000,
    "fullscreen_integrity": 10_000,
    "mouse_leave": 5_000,
    "multi_display": 20_000,
    "screen_share": 20_000,
    "webcam": 20_000,
    "viewport": 5_000,
    "clipboard": 0,
    "forbidden_action": 0,
    "listener_integrity": 0,
    "exam_entered": 0,
    "exam_submit_initiated": 0,
}
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/integrity/test_registry.py -q`

- [ ] **Step 3: Update values and increment `REGISTRY_VERSION`**

Set the exact values from Global Constraints; do not add contest-level overrides.

- [ ] **Step 4: Run the focused test and verify pass**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/integrity/test_registry.py -q`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/contests/integrity/registry.py backend/apps/contests/tests/integrity/test_registry.py
git commit -m "fix: tune integrity event grace periods"
```

### Task 2: Make Worker grace use event chronology

**Files:**
- Modify: `integrity-service/integrity_service/core/incidents.py`
- Test: `integrity-service/tests/test_incidents.py`

**Interfaces:**
- Consumes: `ReceivedEvent.record.client_occurred_at_ms` and `ParsedDefinition.grace_ms`.
- Produces: restore ingestion that escalates only when valid client duration reaches grace; timer escalation remains server-clock based while no restore exists and adds frozen `batch_interval_ms` only as transport delivery tolerance.

- [ ] **Step 1: Add cross-checkpoint duration tests**

Cover a trigger received at server 1 s/client 1 s and restore received at server 11 s/client 1.9 s; assert no escalation. Cover a restore at client `trigger + grace` and assert one escalation. Cover client time before trigger and assert no escalation is inferred from receipt delay.

- [ ] **Step 2: Run tests and verify the short-duration case fails**

Run: `docker exec qjudge-integrity-worker-7fcd253c-5e85-4c43-800a-b951e1932609 pytest tests/test_incidents.py -q`

- [ ] **Step 3: Add a client-duration predicate**

```python
def _client_grace_expired(opened: _OpenIncident, restored: ReceivedEvent) -> bool:
    duration_ms = (
        restored.record.client_occurred_at_ms
        - opened.trigger_client_occurred_at_ms
    )
    return duration_ms >= 0 and duration_ms >= opened.definition.grace_ms
```

Use it for the restore path. Keep `deadline_server_ms` for `tick()` only.

- [ ] **Step 4: Run incident, timeline, and scheduler tests**

Run: `cd integrity-service && pytest tests/test_incidents.py tests/test_timeline.py tests/test_scheduler.py -q`

- [ ] **Step 5: Commit**

```bash
git add integrity-service/integrity_service/core/incidents.py integrity-service/tests/test_incidents.py
git commit -m "fix: evaluate browser grace from client chronology"
```

### Task 3: Stabilize the mouse boundary sensor

**Files:**
- Modify: `frontend/src/features/contest/hooks/useMouseLeaveMonitoring.ts`
- Test: `frontend/src/features/contest/hooks/useMouseLeaveMonitoring.test.ts`

**Interfaces:**
- Produces: one `mouse_leave_triggered` per normal-to-interrupted transition and one `mouse_leave_restored` per interrupted-to-normal transition.

- [ ] **Step 1: Add fake-timer tests**

Assert repeated `mouseleave` callbacks emit once, `mouseenter` before 300 ms emits nothing, a stable leave emits after 300 ms, and a repeated `mouseenter` emits one restore only after a trigger.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd frontend && npm test -- --run src/features/contest/hooks/useMouseLeaveMonitoring.test.ts`

- [ ] **Step 3: Implement transition state and debounce**

Use refs for current interruption and pending timer. Cancel the timer on re-entry/unmount. Remove `MOUSE_LEAVE_EVIDENCE_WINDOW_SECONDS` and both `evidence_window_*` payload fields.

- [ ] **Step 4: Run the focused test and TypeScript check**

Run: `cd frontend && npm test -- --run src/features/contest/hooks/useMouseLeaveMonitoring.test.ts && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/contest/hooks/useMouseLeaveMonitoring.ts frontend/src/features/contest/hooks/useMouseLeaveMonitoring.test.ts
git commit -m "fix: debounce mouse boundary transitions"
```

### Task 4: Retain evidence only for escalated incidents

**Files:**
- Modify: `backend/apps/contests/services/integrity_evidence.py`
- Test: `backend/apps/contests/tests/integrity/test_evidence_chunks.py`

**Interfaces:**
- Produces: `_raw_window()` only for normalized events whose integrity phase is `escalated`; `evidence_statuses_for_events()` filters aliased chunks through `_chunk_matches_window()`.

- [ ] **Step 1: Add retention and projection regressions**

Create triggered/restored-only events and assert `pending_commands == ()`. Add an escalated event and assert one retain command. Associate a far-away chunk through `metadata.incident_ids` and assert it is absent from the summary and playback query.

- [ ] **Step 2: Run the focused failures**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/integrity/test_evidence_chunks.py -q`

- [ ] **Step 3: Gate raw windows and filter candidates**

Use `event_phase(event) == "escalated"` in `_raw_window()`. Before `_evidence_summary_from_loaded`, retain only candidates matching at least one `windows_by_incident[event.incident_id]` through `_chunk_matches_window`.

- [ ] **Step 4: Make playback use the same bounded selector**

Change `evidence_chunks_for_event()` to use the event's incident retain windows and return unique chunks sorted by source/start/sequence. Keep required init data internal to playlist construction rather than counting it as evidence.

- [ ] **Step 5: Run evidence and API tests**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/integrity/test_evidence_chunks.py apps/contests/tests/integrity/test_batch_gateway.py -q`

- [ ] **Step 6: Commit**

```bash
git add backend/apps/contests/services/integrity_evidence.py backend/apps/contests/tests/integrity/test_evidence_chunks.py
git commit -m "fix: bound evidence to escalated incident windows"
```

### Task 5: Project manager-facing episodes

**Files:**
- Modify: `backend/apps/contests/services/participant_dashboard.py`
- Test: `backend/apps/contests/tests/test_participant_dashboard_api.py`
- Modify: `backend/schema.yml`

**Interfaces:**
- Produces: event feed items with `count` equal to occurrence count, `has_evidence: bool`, and `metadata.occurrences` containing incident ID, start, restore, duration, and representative event ID.

- [ ] **Step 1: Add feed projection tests**

Assert triggered/restored-only incidents are excluded, one escalated incident remains, two escalated incidents in the same family within ten seconds become one card, and a gap over ten seconds remains separate.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/test_participant_dashboard_api.py -q`

- [ ] **Step 3: Implement raw incident summaries and episode grouping**

Build immutable internal occurrence records first, discard records without an escalated phase, then group adjacent records by participant/family and the ten-second restored-to-next-trigger gap. Preserve each original incident ID in `metadata.occurrences`.

- [ ] **Step 4: Replace chunk count semantics**

Emit `has_evidence` from source status and remove `evidence_count` from the manager projection/schema.

- [ ] **Step 5: Run dashboard and exam event API tests**

Run: `docker exec oj_backend_dev pytest apps/contests/tests/test_participant_dashboard_api.py apps/contests/tests/integrity/test_evidence_chunks.py -q`

- [ ] **Step 6: Commit**

```bash
git add backend/apps/contests/services/participant_dashboard.py backend/apps/contests/tests/test_participant_dashboard_api.py backend/schema.yml
git commit -m "feat: project integrity incidents as episodes"
```

### Task 6: Render episode and evidence chronology

**Files:**
- Modify: `frontend/src/core/entities/contest.entity.ts`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.participant.mapper.ts`
- Modify: `frontend/src/features/contest/components/admin/IncidentCard.tsx`
- Modify: `frontend/src/features/contest/components/admin/EventIncidentCard.tsx`
- Modify: `frontend/src/features/contest/components/admin/IncidentDetail.tsx`
- Modify: `frontend/src/features/contest/components/admin/IntegrityEvidenceReview.tsx`
- Modify: `frontend/src/features/contest/components/admin/integrityEvidenceTimeline.ts`
- Test: corresponding mapper, card, and timeline tests.

**Interfaces:**
- Consumes: Backend `count`, `has_evidence`, and `metadata.occurrences`.
- Produces: one card per episode, `有證據` boolean copy, occurrence rows, and one deduplicated chronological track per evidence source.

- [ ] **Step 1: Update DTO/entity/mapper tests**

Replace `evidenceCount` with `hasEvidence`; add a typed `occurrences` projection with safe defaults.

- [ ] **Step 2: Update card tests**

Assert `滑鼠離開視窗 · 3 次` and `有證據`; assert no raw `證據 7` or `7 片段` copy exists.

- [ ] **Step 3: Update detail/timeline tests**

Assert each occurrence has exact start/end/duration and that duplicate chunk IDs appear once in chronological order with event markers.

- [ ] **Step 4: Implement the minimal Carbon UI**

Keep the existing card shell. Add no nested cards. Render occurrence rows with Carbon tags and a single source track; select the first occurrence with evidence initially.

- [ ] **Step 5: Run tests and quality gates**

Run: `cd frontend && npm test -- --run src/infrastructure/mappers/contest.mapper.test.ts src/features/contest/components/admin/integrityEvidenceTimeline.test.ts && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/entities/contest.entity.ts frontend/src/infrastructure/api/dto/contest.dto.ts frontend/src/infrastructure/mappers/contest.participant.mapper.ts frontend/src/features/contest/components/admin
git commit -m "feat: render integrity episode evidence timeline"
```

### Task 7: Verify completion and submission shutdown

**Files:**
- Modify only if regression tests expose a defect: `integrity-service/integrity_service/core/connectivity.py`, `integrity-service/integrity_service/core/timeline.py`
- Test: `integrity-service/tests/test_connectivity.py`, `integrity-service/tests/test_timeline.py`

**Interfaces:**
- Produces: no `connectivity_timeout` after exam submission closes participant monitoring.

- [ ] **Step 1: Add or confirm the submission shutdown regression**

Feed `exam_submit_initiated`, advance beyond 30 seconds, and assert no connectivity timeout command.

- [ ] **Step 2: Run Worker core suite**

Run: `cd integrity-service && pytest tests/test_connectivity.py tests/test_incidents.py tests/test_timeline.py tests/test_scheduler.py -q`

- [ ] **Step 3: Run Backend and frontend focused suites**

Run the commands from Tasks 4–6 and record any environmental blocker separately from code failures.

- [ ] **Step 4: Commit any regression-only correction**

```bash
git add integrity-service/integrity_service/core integrity-service/tests
git commit -m "fix: close integrity monitoring on submission"
```
