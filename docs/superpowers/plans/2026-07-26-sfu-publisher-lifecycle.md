# SFU Publisher Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure each SFU publisher lifecycle issues at most one stop request and shares one configuration request across its screen-share and webcam publishers.

**Architecture:** Keep browser lifecycle ownership in the feature-level `SfuVideoPublisher`; retain HTTP calls in `exam.repository.ts`. Cache a successful/in-flight configuration request by contest in the publisher module, and make stop a lifecycle state transition that coalesces concurrent and completed calls until the next successful start.

**Tech Stack:** React 19, TypeScript, Vitest, WebRTC browser APIs.

## Global Constraints

- Do not change backend routes, data models, or Cloudflare credentials.
- Preserve a session-id-aware stop request for a successfully started publisher.
- Do not issue a stop request when this publisher instance never became active.
- Keep screen-share and webcam as separate publisher instances and source modules.

---

### Task 1: Idempotent publisher stop

**Files:**
- Create: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/useSfuVideoPublisher.test.ts`
- Modify: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/sfuScreenSharePublisher.ts`

**Interfaces:**
- Produces: `SfuVideoPublisher.stop(contestId): Promise<void>` that shares one request for repeated calls until a later successful `start`.

- [ ] Write a failing test that starts one publisher, calls `stop()` three times concurrently and once after resolution, and expects exactly one `stopRealtimeSfuPublisher(contestId, sessionId, sourceModule)` call.
- [ ] Run the test and confirm it fails because the current implementation calls the repository once per stop invocation.
- [ ] Add a private stop promise and reset it only after a later successful start; retain the active session id before clearing local peer state.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Shared publisher configuration

**Files:**
- Modify: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/useSfuVideoPublisher.test.ts`
- Modify: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/sfuScreenSharePublisher.ts`

**Interfaces:**
- Produces: two publisher instances for the same contest sharing one successful/in-flight `getRealtimeSfuConfig` request.

- [ ] Write a failing test that starts screen-share and webcam publishers concurrently for one contest and expects one configuration fetch.
- [ ] Run the test and confirm it fails because each instance fetches configuration independently.
- [ ] Cache configuration promises by contest; evict a rejected promise so a later start can retry.
- [ ] Run publisher tests, then the existing capture-hook test, and confirm both pass.
