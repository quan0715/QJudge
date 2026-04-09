# Anticheat Module Risk Fix & Test Coverage

**Date:** 2026-04-09
**Scope:** Risk fixes (R1-R3) + Test coverage (T1-T8)
**Branch:** dev

## Context

The frontend anticheat module (`features/contest/anticheat/`, `detectors/`, `hooks/`) is production-grade but has several identified risks and test gaps. This spec covers targeted fixes for correctness/security risks and fills critical test coverage holes.

## Risk Fixes

### R1: Module-level state leak — orchestrator cleanup

**Problem:** `orchestrator.ts` uses a module-level `contestStates` Map. When a student navigates between contests without page reload, stale entries persist and dedupe records from a previous contest can interfere with the new one.

**Fix:** Add a cleanup effect in `ExamModeWrapper.tsx` that calls `resetAnticheatOrchestrator(contestId)` on unmount. This aligns with the existing `clearRuntimeScreenShareReauth` cleanup at line 166-168.

**Files:** `ExamModeWrapper.tsx`

### R2: FullscreenDetector dual countdown — simplify detector

**Problem:** `FullscreenDetector` manages its own grace countdown internally (startRecovery/clearRecovery with timers), AND `useFullscreenMonitoring` drives a second countdown via `useViolationPipeline`. This creates two stacked timers — effective grace period may be detector's 3s + pipeline's 3s = 6s.

**Fix:**
- Remove internal countdown logic from `FullscreenDetector` (startRecovery timer, recoveryInterval, recoveryActive, graceStartedAt)
- Remove `onCountdownChange` callback and `FullscreenDetectorOptions` interface
- Detector fires a single `exit_fullscreen_triggered` event immediately on fullscreen exit (after 100ms settlement)
- No longer fires `exit_fullscreen` from detector — that becomes the pipeline's escalated event
- `useFullscreenMonitoring` pipeline handles the full lifecycle: triggered event → grace countdown → escalated event
- Keep 100ms settlement delay and `verifyIntegrity` unchanged

**Files:** `fullscreenDetector.ts`, `useFullscreenMonitoring.ts`, `useFullscreenMonitoring.test.ts`, `fullscreenDetector.test.ts` (if exists)

### R3: iPad misdetection on touch Mac — hover media query

**Problem:** `detectIPadLike()` in `anticheatModulePolicy.ts` matches touch-enabled Macs (`/Mac/ + maxTouchPoints > 0`) as iPad-like, causing wrong policy (e.g., disabling screen share, enabling viewport integrity).

**Fix:** Add `!matchMedia('(hover: hover)').matches` guard to `isTouchMac` and `isDesktopLikeIpadUA` branches. Mac always has trackpad/mouse → `hover: hover` is true. iPad has no native hover → false. Does not affect `isIPadUA` or `isIOSUAData` branches (already explicit iPad signals).

**Files:** `anticheatModulePolicy.ts`, `anticheatModulePolicy.test.ts`

## Test Coverage

### T1: useScreenShareMonitoring (new)

Test cases:
- stream lost → runtimeReauth countdown starts, pipeline.trigger called
- stream restored → countdown cancelled, pipeline.recover called
- countdown reaches 0 → requestForceSubmit called with correct params
- examSubmitted / monitoringDisabled → clearRuntimeScreenShareReauth called
- duplicate stream lost while already active → no duplicate trigger

### T2: useWebcamMonitoring (new)

Test cases:
- stream lost → pipeline.trigger called
- stream restored → pipeline.recover called
- isPrimary=true → escalation is force_submit
- isPrimary=false → escalation override is log_only

### T3: runtimeReauthState (expand existing 33-line test)

Additional test cases:
- countdown ticker emits every 300ms, remainingSeconds decrements
- countdown reaches 0 → remainingSeconds === 0
- endRuntimeScreenShareReauth grace period expires → active becomes false
- multi-contestId isolation: contest A reauth does not affect contest B snapshot
- clearRuntimeScreenShareReauth stops ticker

### T4: selectPrimaryCountdownFromRegistry (new)

Test cases:
- multiple active countdowns → returns highest priority (lowest countdownPriority number)
- all null → returns { value: null, source: null }
- single active countdown → returns that one
- equal priority impossible (each route has unique priority)

### T5: useViolationPipeline externalCountdown mode (expand)

Additional test cases:
- externalCountdown=true: trigger does not start internal countdown
- externalCountdown=true: recoveryCountdown always returns null
- externalCountdown=true: recover does not call clearRecovery
- externalCountdown=true: event recording still works normally

### T6: webcamHandoffStore (new)

Test cases:
- setRuntimeWebcamHandoff stores stream
- getRuntimeWebcamHandoff retrieves stored stream
- clearRuntimeWebcamHandoff stops tracks and clears

### T7: FullscreenDetector test update (update existing)

Update to match R2 simplification:
- fullscreen exit → fires single exit_fullscreen_triggered event (no internal countdown)
- 100ms settlement: event fires after settlement, not immediately
- verifyIntegrity still works
- stop() cleans up listener

### T8: anticheatModulePolicy test expansion (expand existing)

Additional test cases:
- touch Mac (hover: hover + maxTouchPoints > 0) → NOT detected as iPad
- iPad (no hover + maxTouchPoints > 0) → detected as iPad
- desktop Mac (hover: hover + maxTouchPoints === 0) → NOT detected as iPad

## Out of Scope

- Viewport monitoring threshold tuning (needs real device data)
- Screen share reauth race condition (low risk, existing guards sufficient)
- ExamModeWrapper decomposition (separate refactor effort)

## Risks & Rollback

- R2 changes FullscreenDetector's event timing — existing fullscreen tests must be updated to match
- R3 relies on `hover` media query accuracy — known to be reliable on Safari 15+, Chrome 80+, Firefox 80+
- All changes are frontend-only, no backend migration needed
- Rollback: revert the commit(s)
