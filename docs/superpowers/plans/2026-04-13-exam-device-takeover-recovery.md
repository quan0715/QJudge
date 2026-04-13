# Exam Device Takeover Recovery Implementation Plan

> **For agentic workers:** Follow this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not preserve fallback branches to the legacy manual-approval takeover flow.

**Goal:** Replace the current "exam in progress on another device" dead-end with a single self-service `take over and recover exam` flow. When a student takes over from a new device, the old device's login becomes invalid immediately, the participant is moved to `paused`, a formal exam event is recorded, and the frontend routes the student into the normal resume/precheck flow.

**Non-goals:**
- Do not keep the teacher approval takeover flow as a fallback.
- Do not gate takeover on heartbeat or inactivity heuristics.
- Do not send the student directly into the answering screen.

**Architecture:** Login conflict becomes an explicit recovery checkpoint, not a hard stop. Auth layer detects a cross-device exam conflict and returns recovery metadata. The recovery action performs session replacement: invalidate old auth state, rebind active session to the new device, persist an exam event, transition participant to `paused`, and hand the frontend enough context to enter the standard resume path.

**Tech Stack:** Django + DRF + SimpleJWT + Redis cache session keys, React + Carbon frontend, Playwright / Django tests

---

## Product Rules

1. If the same device logs in again during an exam, login proceeds normally.
2. If a different device logs in during an exam, the user sees exactly one recovery action:
   `接管並恢復考試`
3. When the user confirms takeover:
   - old device auth is invalidated immediately
   - old contest active session is replaced
   - participant becomes `paused`
   - an `ExamEvent` is written
   - frontend enters the existing resume/precheck flow
4. No teacher approval step remains in the product.
5. No heartbeat-based branch remains in the product.
6. No legacy "hard blocked forever" login fallback remains in the product.

---

## File Map

### Backend

| File | Responsibility |
|---|---|
| `backend/apps/users/views/common.py` | Detect conflict and return takeover-required payload only |
| `backend/apps/users/views/token.py` | Execute takeover recovery action |
| `backend/apps/users/serializers.py` | Recovery request / response contract cleanup |
| `backend/apps/contests/services/anti_cheat_session.py` | Reuse only the session invalidation / rebinding primitives that remain valid |
| `backend/apps/contests/services/participant_state.py` | Centralize participant transition to `paused` during recovery |
| `backend/apps/contests/views/exam_anticheat.py` | Remove manual takeover approval endpoint |
| `backend/apps/contests/services/participant_dashboard.py` | Remove `can_approve_takeover` legacy action exposure |
| `backend/apps/contests/models.py` | Review whether `LOCKED_TAKEOVER` remains necessary |
| `backend/apps/users/tests/test_exam_login_security.py` | Auth-layer recovery tests |
| `backend/apps/contests/tests/...` | Remove or rewrite old approval/takeover expectations |

### Frontend

| File | Responsibility |
|---|---|
| `frontend/src/infrastructure/api/http.client.ts` | Preserve structured backend error payload |
| `frontend/src/infrastructure/api/repositories/auth.repository.ts` | Add takeover recovery API call |
| `frontend/src/features/auth/screens/LoginScreen.tsx` | Show one takeover CTA and route into recovery |
| `frontend/src/features/auth/screens/OAuthCallbackScreen.tsx` | Mirror same recovery behavior for OAuth login |
| `frontend/src/features/auth/utils/...` or contest routing helpers | Resolve correct resume/precheck destination |
| `frontend/src/infrastructure/api/repositories/contestParticipants.repository.ts` | Remove teacher takeover approval API call |
| `frontend/src/features/contest/screens/settings/ContestParticipantsScreen.tsx` | Remove legacy approve takeover button and handlers |
| `frontend/src/i18n/locales/*/*.json` | Remove legacy manual approval strings; add final recovery copy if needed |
| `frontend/tests/e2e/exam-login-dual-device.e2e.spec.ts` | Rewrite to assert recovery, not permanent denial |

---

## Task 1: Freeze the new contract

**Files:**
- Modify: `backend/apps/users/views/common.py`
- Modify: `backend/apps/users/serializers.py`
- Modify: `frontend/src/features/auth/screens/LoginScreen.tsx`
- Modify: `frontend/src/features/auth/screens/OAuthCallbackScreen.tsx`

- [ ] **Step 1: Replace the legacy login-blocked product meaning**

Define one canonical auth conflict contract. The backend response for cross-device exam conflict must include:

```json
{
  "success": false,
  "code": "EXAM_TAKEOVER_REQUIRED",
  "message": "偵測到你有未完成的考試，可在此裝置接管並恢復。",
  "active_exam": {
    "contest_id": "...",
    "contest_name": "...",
    "exam_status": "in_progress|paused|locked"
  },
  "conflict_token": "..."
}
```

Do not keep a second branch that tells the frontend to "contact invigilator" for the same scenario.

- [ ] **Step 2: Remove fallback semantics from the frontend**

In both login entry points:
- handle only the new conflict code
- show one action button: `接管並恢復考試`
- do not present teacher approval as a path
- do not leave legacy permanent-block copy behind

- [ ] **Step 3: Align inline code comments / docstrings**

Update comments/docstrings so they describe takeover recovery, not "always returns 403 with no takeover option".

---

## Task 2: Implement backend session replacement

**Files:**
- Modify: `backend/apps/users/views/token.py`
- Create or Modify: `backend/apps/contests/services/exam_takeover.py`
- Modify: `backend/apps/contests/services/participant_state.py`
- Modify: `backend/apps/contests/services/anti_cheat_session.py`

- [ ] **Step 1: Introduce a dedicated takeover service**

Create a focused service boundary for takeover recovery. Recommended entry point:

```python
perform_exam_takeover(
    *,
    user,
    participant,
    request,
    conflict_payload,
) -> dict
```

This service must own the full transition, not spread critical logic across auth views.

- [ ] **Step 2: Invalidate the old device immediately**

Takeover must invalidate old login state, not just old exam state:
- blacklist old refresh tokens for the user except the new session
- re-pin allowed access JTI to the new session
- replace the contest active session cache entry
- ensure old device requests fail after takeover

Do not rely on heartbeat expiry.

- [ ] **Step 3: Transition participant to `paused`**

On successful takeover:
- set `exam_status = PAUSED`
- clear lock metadata if takeover should not preserve any previous takeover lock fields
- do not set `LOCKED_TAKEOVER`
- do not auto-set `IN_PROGRESS`

Centralize this in `participant_state.py` if possible so state transitions stay coherent.

- [ ] **Step 4: Record the exam event**

Write one authoritative exam event, for example:

```python
event_type="device_takeover_completed"
metadata={
    "replaced_device_id": "...",
    "new_device_id": "...",
    "replaced_ip": "...",
    "new_ip": "...",
    "replaced_user_agent": "...",
    "new_user_agent": "...",
    "source": "login_takeover",
}
```

Also write `ContestActivity` if the dashboard still depends on it, but `ExamEvent` is mandatory.

- [ ] **Step 5: Return resume context**

The takeover endpoint should return enough context for the frontend to enter recovery:
- authenticated user payload
- active exam / contest ID
- optional explicit `resume_required: true`

Do not redirect students into a generic post-login landing page after takeover.

---

## Task 3: Route the frontend into resume flow

**Files:**
- Modify: `frontend/src/features/auth/screens/LoginScreen.tsx`
- Modify: `frontend/src/features/auth/screens/OAuthCallbackScreen.tsx`
- Modify: frontend contest routing helpers as needed

- [ ] **Step 1: Introduce a dedicated post-takeover redirect**

After takeover succeeds:
- store authenticated user state
- navigate to the contest-specific resume/precheck route
- do not route to generic dashboard/onboarding landing

Expected behavior:
- classroom contest: `/classrooms/:classroomId/contest/:contestId/exam-precheck`
- then existing exam start/resume flow takes over

- [ ] **Step 2: Reuse the current continue-exam flow**

The takeover flow should end at the same path students already use to continue an interrupted exam:
- precheck
- permissions / anti-cheat setup
- start/resume API

Do not build a second ad-hoc resume mechanism.

- [ ] **Step 3: Preserve one clear UX state**

If takeover succeeds but resume flow fails later, show the normal exam resume/precheck error state. Do not bounce the user back to the old login conflict screen.

---

## Task 4: Remove the manual approval legacy flow

**Files:**
- Modify: `backend/apps/contests/views/exam_anticheat.py`
- Modify: `backend/apps/contests/services/participant_dashboard.py`
- Modify: `frontend/src/infrastructure/api/repositories/contestParticipants.repository.ts`
- Modify: `frontend/src/features/contest/screens/settings/ContestParticipantsScreen.tsx`
- Modify: `frontend/src/features/contest/components/participants/...`
- Modify: `frontend/src/i18n/locales/*/contest.json`

- [ ] **Step 1: Remove the backend endpoint**

Delete the manual approval action:
- `POST /api/v1/contests/<id>/exam/takeover-approve/`

If route deletion is risky mid-refactor, stub it temporarily to a hard 410 or 404 during transition, then remove it entirely before merge.

- [ ] **Step 2: Remove dashboard exposure**

Remove:
- `can_approve_takeover`
- participant UI affordances for approving takeover
- toast / confirm copy tied to manual approval

- [ ] **Step 3: Remove related API client code**

Delete:
- `approveTakeover(...)`
- any dedicated DTOs/types only supporting manual approval

- [ ] **Step 4: Remove or retire `LOCKED_TAKEOVER` usage**

Audit all uses of:
- `LOCKED_TAKEOVER`
- `takeover_locked`
- `takeover_approved`
- `takeover_approve`

Target state:
- new takeover flow never writes these states/events
- remove them fully if safe
- if full removal is too broad for one PR, isolate them as legacy-read-only compatibility and add a follow-up cleanup task

Do not let the new code path depend on them.

---

## Task 5: Clean up legacy branches and dead code

**Files:**
- Modify across backend and frontend auth/contest modules

- [ ] **Step 1: Remove heartbeat-based takeover assumptions**

Delete any comments, branches, or partial code paths that imply:
- takeover requires waiting for heartbeat timeout
- takeover decision depends on stale/inactive heuristics

- [ ] **Step 2: Remove the permanent block copy**

Delete legacy copy such as:
- `考試進行中，無法從其他裝置登入。請回到原裝置完成考試後再試。`

Replace with explicit recovery wording only.

- [ ] **Step 3: Remove dangling conflict-token legacy semantics**

The conflict token should exist for one purpose only: execute takeover recovery.
Do not keep unused "maybe approval later" semantics around it.

- [ ] **Step 4: Remove obsolete tests**

Delete or rewrite tests that assert:
- login is permanently blocked from device B
- takeover requires teacher approval
- legacy admin action visibility

---

## Task 6: Test coverage

**Files:**
- Modify: `backend/apps/users/tests/test_exam_login_security.py`
- Modify/Add: relevant contest tests
- Modify: `frontend/tests/e2e/exam-login-dual-device.e2e.spec.ts`

- [ ] **Step 1: Backend auth tests**

Cover:
- same-device login during exam still succeeds
- different-device login returns `EXAM_TAKEOVER_REQUIRED`
- takeover endpoint authenticates the new device
- participant becomes `paused`
- exam event is recorded
- old device auth is invalid after takeover

- [ ] **Step 2: Frontend interaction tests**

Cover:
- login screen renders one takeover CTA
- OAuth callback screen renders same CTA
- successful takeover routes into resume/precheck path

- [ ] **Step 3: End-to-end recovery test**

Rewrite the dual-device E2E scenario:
- device A starts exam
- device B logs in and sees takeover prompt
- device B confirms takeover
- device A loses auth / fails protected requests
- device B lands in resume/precheck flow

Do not leave the old permanent-denial E2E expectation in place.

---

## Task 7: Verification checklist

- [ ] Different-device login during active exam never dead-ends the student
- [ ] Student sees one recovery CTA, not multiple branches
- [ ] Takeover always writes an exam event
- [ ] Old device auth is invalid immediately after takeover
- [ ] Participant always becomes `paused` before resume
- [ ] Frontend always routes to resume/precheck, never directly to answering UI
- [ ] No teacher takeover approval path remains in product code
- [ ] No heartbeat-based takeover logic remains in product code
- [ ] Legacy manual approval tests and strings are removed

---

## Suggested delivery split

### PR 1: New takeover recovery flow
- backend auth conflict contract
- takeover execution service
- frontend login/OAuth recovery UI
- resume redirect
- backend + frontend tests for the new flow

### PR 2: Legacy cleanup
- remove manual approval endpoint and UI
- remove `can_approve_takeover`
- prune stale enums/events if safe
- rewrite/delete obsolete tests and copy

Do not ship PR 1 with runtime fallbacks that preserve the old teacher-approval product behavior. If temporary compatibility code is required for deploy safety, isolate it behind internal-only code paths and delete it in PR 2 immediately.
