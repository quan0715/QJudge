# Anticheat Risk Fix & Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 identified risks in the anticheat module and fill 8 critical test coverage gaps.

**Architecture:** Targeted fixes to existing files — no new modules or architectural changes. Risk fixes touch production code; test tasks create new test files or expand existing ones. Each task is independently committable.

**Tech Stack:** TypeScript, React hooks, Vitest, @testing-library/react

**Test command:** `cd /Users/quan/online_judge/frontend && npx vitest run <path>`

---

## File Map

**Production files modified:**
- `frontend/src/features/contest/components/ExamModeWrapper.tsx` — R1: add orchestrator cleanup on unmount
- `frontend/src/features/contest/detectors/fullscreenDetector.ts` — R2: remove internal countdown logic
- `frontend/src/features/contest/domain/anticheatModulePolicy.ts` — R3: add hover media query guard

**Test files created:**
- `frontend/src/features/contest/hooks/useScreenShareMonitoring.test.ts` — T1
- `frontend/src/features/contest/hooks/useWebcamMonitoring.test.ts` — T2
- `frontend/src/features/contest/domain/violationRoutes.test.ts` — T4
- `frontend/src/features/contest/anticheat/webcamHandoffStore.test.ts` — T6

**Test files modified:**
- `frontend/src/features/contest/anticheat/runtimeReauthState.test.ts` — T3
- `frontend/src/features/contest/hooks/useViolationPipeline.test.ts` — T5
- `frontend/src/features/contest/hooks/useFullscreenMonitoring.test.ts` — T7 (verify unchanged after R2)
- `frontend/src/features/contest/domain/anticheatModulePolicy.test.ts` — T8

---

### Task 1: R1 — Orchestrator state cleanup on ExamModeWrapper unmount

**Files:**
- Modify: `frontend/src/features/contest/components/ExamModeWrapper.tsx`

- [ ] **Step 1: Add resetAnticheatOrchestrator import**

In `ExamModeWrapper.tsx`, the existing import at line 18 already imports `syncAnticheatPhaseWithExamStatus`. Add `resetAnticheatOrchestrator` to the same import:

```typescript
import { syncAnticheatPhaseWithExamStatus, resetAnticheatOrchestrator } from "@/features/contest/anticheat/orchestrator";
```

- [ ] **Step 2: Add unmount cleanup effect**

Add a new effect after the existing `syncAnticheatPhaseWithExamStatus` effect (after line 442). Place it next to the existing `clearRuntimeScreenShareReauth` cleanup (line 164-168 area) for consistency. Add this effect:

```typescript
useEffect(() => {
  return () => {
    resetAnticheatOrchestrator(contestId);
  };
}, [contestId]);
```

- [ ] **Step 3: Run existing fullscreen monitoring tests to verify no regression**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/hooks/useFullscreenMonitoring.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/contest/components/ExamModeWrapper.tsx
git commit -m "fix(anticheat): reset orchestrator state on ExamModeWrapper unmount

Prevents stale dedupe entries from interfering when navigating between
contests in the same SPA session without page reload."
```

---

### Task 2: R2 — Simplify FullscreenDetector (remove internal countdown)

**Files:**
- Modify: `frontend/src/features/contest/detectors/fullscreenDetector.ts`

- [ ] **Step 1: Rewrite FullscreenDetector to remove internal countdown**

Replace the entire content of `fullscreenDetector.ts` with:

```typescript
import { isFullscreen } from "@/core/usecases/exam";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";

const FULLSCREEN_SETTLEMENT_MS = 100;

export class FullscreenDetector implements ExamDetector {
  readonly id = "fullscreen" as const;
  readonly severity = "violation" as const;

  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private handleFullscreenChange: ((event: Event) => void) | null = null;
  private lastVerifyResponse: string | null = null;
  private settlementTimer: ReturnType<typeof setTimeout> | null = null;

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleFullscreenChange = (event: Event) => {
      const verifyToken = (event as Event & { __examVerify?: string }).__examVerify;
      if (verifyToken) {
        this.lastVerifyResponse = verifyToken;
        return;
      }
      // Wait for browser to settle fullscreen state
      if (this.settlementTimer) clearTimeout(this.settlementTimer);
      this.settlementTimer = setTimeout(() => {
        this.settlementTimer = null;
        if (!isFullscreen()) {
          this.onViolation?.({
            detectorId: this.id,
            eventType: "exit_fullscreen_triggered",
            message: "Fullscreen exited",
            severity: "info",
          });
        }
      }, FULLSCREEN_SETTLEMENT_MS);
    };

    document.addEventListener("fullscreenchange", this.handleFullscreenChange as EventListener);
  }

  stop(): void {
    if (this.handleFullscreenChange) {
      document.removeEventListener("fullscreenchange", this.handleFullscreenChange as EventListener);
      this.handleFullscreenChange = null;
    }
    if (this.settlementTimer) {
      clearTimeout(this.settlementTimer);
      this.settlementTimer = null;
    }
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: isFullscreen(), detail: isFullscreen() ? undefined : "Not in fullscreen" };
  }

  verifyIntegrity(token: string): boolean {
    this.lastVerifyResponse = null;
    const synthetic = new Event("fullscreenchange");
    (synthetic as any).__examVerify = token;
    document.dispatchEvent(synthetic);
    return this.lastVerifyResponse === token;
  }
}
```

Key changes:
- Removed `TFunction` constructor parameter (no longer needed — no i18n messages)
- Removed `FullscreenDetectorOptions`, `onCountdownChange`
- Removed `recoveryActive`, `graceStartedAt`, `recoveryTimeout`, `recoveryInterval`, `startRecovery()`, `clearRecovery()`
- Detector now fires only `exit_fullscreen_triggered` (info severity) — pipeline handles escalation to `exit_fullscreen`
- Added `settlementTimer` tracking for proper cleanup on rapid events

- [ ] **Step 2: Update useFullscreenMonitoring to handle simplified detector**

`useFullscreenMonitoring.ts` already works correctly with the simplified detector. It listens for `fullscreenchange` directly (not through the detector) and drives the pipeline. The detector class is actually NOT used by `useFullscreenMonitoring` — it handles detection inline. Verify this by reading the hook: lines 59-74 show it listens to `fullscreenchange` directly and calls `pipeline.trigger()` / `pipeline.recover()`.

No changes needed to `useFullscreenMonitoring.ts`.

- [ ] **Step 3: Check if any other file imports FullscreenDetector or FullscreenDetectorOptions**

Run: `cd /Users/quan/online_judge/frontend && grep -r "FullscreenDetector\|FullscreenDetectorOptions" --include="*.ts" --include="*.tsx" src/ | grep -v "node_modules" | grep -v ".test."`

Update any imports that reference `FullscreenDetectorOptions` or pass `TFunction` to the constructor.

- [ ] **Step 4: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/hooks/useFullscreenMonitoring.test.ts src/features/contest/detectors/`
Expected: All tests PASS (useFullscreenMonitoring tests don't use the detector class)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/contest/detectors/fullscreenDetector.ts
git commit -m "refactor(anticheat): simplify FullscreenDetector, remove internal countdown

Detector now only fires exit_fullscreen_triggered on fullscreen exit.
Countdown and escalation are handled by useViolationPipeline, consistent
with all other detectors. Removes dual-timer issue where detector and
pipeline each ran independent grace countdowns."
```

---

### Task 3: R3 — Fix iPad misdetection on touch Mac via hover media query

**Files:**
- Modify: `frontend/src/features/contest/domain/anticheatModulePolicy.ts:133-149`

- [ ] **Step 1: Add hover capability check to detectIPadLike**

In `anticheatModulePolicy.ts`, modify the `detectIPadLike` function. Add `hasHoverCapability` check and apply it to the `isTouchMac` and `isDesktopLikeIpadUA` conditions:

```typescript
const detectIPadLike = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const uaDataPlatform = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  const hasCoarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const hasHoverCapability =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover)").matches;
  const isIPadUA = /iPad/i.test(ua);
  const isTouchMac = /Mac/i.test(platform) && maxTouchPoints > 0 && !hasHoverCapability;
  const isDesktopLikeIpadUA = /Macintosh/i.test(ua) && (maxTouchPoints > 0 || hasCoarsePointer) && !hasHoverCapability;
  const isIOSUAData = typeof uaDataPlatform === "string" && /iOS/i.test(uaDataPlatform);
  return isIPadUA || isTouchMac || isDesktopLikeIpadUA || isIOSUAData;
};
```

Changes: added `hasHoverCapability` variable, added `&& !hasHoverCapability` to `isTouchMac` and `isDesktopLikeIpadUA`.

- [ ] **Step 2: Run existing policy tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/domain/anticheatModulePolicy.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/domain/anticheatModulePolicy.ts
git commit -m "fix(anticheat): prevent touch Mac from being detected as iPad

Add hover media query guard to detectIPadLike(). Mac devices always have
trackpad/mouse (hover: hover = true), iPad does not. Prevents touch Macs
from receiving tablet policy (disabled screen share, viewport integrity)."
```

---

### Task 4: T8 — Add touch Mac test cases to anticheatModulePolicy.test.ts

**Files:**
- Modify: `frontend/src/features/contest/domain/anticheatModulePolicy.test.ts`

- [ ] **Step 1: Add detectIPadLike unit tests**

The `detectIPadLike` function is not exported — it's called internally by `detectAnticheatCapability`. We test through the public API. Add a new describe block at the end of the test file:

```typescript
import {
  buildExamEntryDeviceMetadata,
  computeEffectiveRequiredModules,
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "./anticheatModulePolicy";
```

Update the import to include `detectAnticheatCapability`, then add:

```typescript
describe("detectAnticheatCapability — iPad vs touch Mac", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, writable: true });
    vi.restoreAllMocks();
  });

  const mockNavigator = (overrides: Record<string, unknown>) => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        userAgent: "",
        platform: "",
        maxTouchPoints: 0,
        ...overrides,
      },
      writable: true,
    });
  };

  const mockMatchMedia = (results: Record<string, boolean>) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: results[query] ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  };

  it("touch Mac with hover capability is NOT detected as tablet", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 10,
    });
    mockMatchMedia({
      "(pointer: coarse)": true,
      "(hover: hover)": true,
    });

    const result = detectAnticheatCapability();
    expect(result.isTablet).toBe(false);
    expect(result.isIPadLike).toBe(false);
  });

  it("iPad (no hover) IS detected as tablet", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    mockMatchMedia({
      "(pointer: coarse)": true,
      "(hover: hover)": false,
    });

    const result = detectAnticheatCapability();
    expect(result.isIPadLike).toBe(true);
    expect(result.isTablet).toBe(true);
  });

  it("desktop Mac (no touch, has hover) is NOT detected as tablet", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    mockMatchMedia({
      "(pointer: coarse)": false,
      "(hover: hover)": true,
    });

    const result = detectAnticheatCapability();
    expect(result.isTablet).toBe(false);
    expect(result.isIPadLike).toBe(false);
  });

  it("explicit iPad UA is always detected regardless of hover", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)",
      platform: "iPad",
      maxTouchPoints: 5,
    });
    mockMatchMedia({
      "(pointer: coarse)": true,
      "(hover: hover)": false,
    });

    const result = detectAnticheatCapability();
    expect(result.isIPadLike).toBe(true);
    expect(result.isTablet).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/domain/anticheatModulePolicy.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/domain/anticheatModulePolicy.test.ts
git commit -m "test(anticheat): add iPad vs touch Mac detection test cases

Covers hover media query guard: touch Mac (hover capable) not detected
as iPad, iPad (no hover) correctly detected, explicit iPad UA always
detected."
```

---

### Task 5: T3 — Expand runtimeReauthState tests

**Files:**
- Modify: `frontend/src/features/contest/anticheat/runtimeReauthState.test.ts`

- [ ] **Step 1: Rewrite with expanded coverage**

Replace the entire file:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginRuntimeScreenShareReauth,
  endRuntimeScreenShareReauth,
  clearRuntimeScreenShareReauth,
  isRuntimeScreenShareReauthActive,
} from "./runtimeReauthState";

describe("runtimeReauthState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T00:00:00Z"));
    clearRuntimeScreenShareReauth();
  });

  afterEach(() => {
    clearRuntimeScreenShareReauth();
    vi.useRealTimers();
  });

  it("is active during reauth", () => {
    beginRuntimeScreenShareReauth();
    expect(isRuntimeScreenShareReauthActive()).toBe(true);
  });

  it("keeps a short grace window after reauth ends", () => {
    beginRuntimeScreenShareReauth();
    endRuntimeScreenShareReauth(1000);

    expect(isRuntimeScreenShareReauthActive()).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(isRuntimeScreenShareReauthActive()).toBe(false);
  });

  it("contestId isolation: contest A reauth does not affect contest B", () => {
    beginRuntimeScreenShareReauth("contest-A", 5000);
    expect(isRuntimeScreenShareReauthActive("contest-A")).toBe(true);
    expect(isRuntimeScreenShareReauthActive("contest-B")).toBe(false);
  });

  it("clearRuntimeScreenShareReauth makes it inactive", () => {
    beginRuntimeScreenShareReauth("contest-1", 10000);
    expect(isRuntimeScreenShareReauthActive("contest-1")).toBe(true);

    clearRuntimeScreenShareReauth("contest-1");
    expect(isRuntimeScreenShareReauthActive("contest-1")).toBe(false);
  });

  it("endRuntimeScreenShareReauth with 0 grace becomes inactive immediately", () => {
    beginRuntimeScreenShareReauth("contest-1", 5000);
    endRuntimeScreenShareReauth("contest-1", 0);

    expect(isRuntimeScreenShareReauthActive("contest-1")).toBe(false);
  });

  it("global check returns true if any contest is active", () => {
    beginRuntimeScreenShareReauth("contest-A", 5000);

    // Global check (no contestId) should find contest-A
    expect(isRuntimeScreenShareReauthActive()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/anticheat/runtimeReauthState.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/anticheat/runtimeReauthState.test.ts
git commit -m "test(anticheat): expand runtimeReauthState tests

Add coverage for contestId isolation, clear behavior, zero-grace end,
and global active check across multiple contests."
```

---

### Task 6: T4 — selectPrimaryCountdownFromRegistry tests

**Files:**
- Create: `frontend/src/features/contest/domain/violationRoutes.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { selectPrimaryCountdownFromRegistry } from "./violationRoutes";

describe("selectPrimaryCountdownFromRegistry", () => {
  it("returns null when all countdowns are null", () => {
    const m = new Map<string, number | null>();
    m.set("screen_share", null);
    m.set("fullscreen", null);

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: null, source: null });
  });

  it("returns null when map is empty", () => {
    const result = selectPrimaryCountdownFromRegistry(new Map());
    expect(result).toEqual({ value: null, source: null });
  });

  it("returns the single active countdown", () => {
    const m = new Map<string, number | null>();
    m.set("fullscreen", 5);
    m.set("tab_hidden", null);

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: 5, source: "fullscreen" });
  });

  it("returns highest priority (lowest countdownPriority) when multiple active", () => {
    const m = new Map<string, number | null>();
    m.set("screen_share", 8);    // priority 0
    m.set("fullscreen", 3);       // priority 3
    m.set("tab_hidden", 5);       // priority 5

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: 8, source: "screen_share" });
  });

  it("viewport (priority 2) beats fullscreen (priority 3)", () => {
    const m = new Map<string, number | null>();
    m.set("viewport", 2);
    m.set("fullscreen", 5);

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: 2, source: "viewport" });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/domain/violationRoutes.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/domain/violationRoutes.test.ts
git commit -m "test(anticheat): add selectPrimaryCountdownFromRegistry tests

Covers empty/null map, single countdown, and multi-countdown priority
selection."
```

---

### Task 7: T5 — Expand useViolationPipeline externalCountdown tests

**Files:**
- Modify: `frontend/src/features/contest/hooks/useViolationPipeline.test.ts`

- [ ] **Step 1: Add externalCountdown recover test**

The existing test at line 325-354 covers trigger + recover in external mode. Add one more case after it to verify recover does not clear timers (since there are none):

```typescript
it("externalCountdown=true: recover without prior trigger is a no-op", () => {
  const config = makeConfig({ externalCountdown: true });
  const { result } = renderHook(() => useViolationPipeline(config));

  act(() => { result.current.recover("spurious_recover"); });

  expect(result.current.isInterrupted).toBe(false);
  expect(result.current.recoveryCountdown).toBeNull();
  // No restored event should be recorded (wasn't interrupted)
  const restoredCalls = mockRecordExamEvent.mock.calls.filter(
    (c: unknown[]) => c[1] === "viewport_restored",
  );
  expect(restoredCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/hooks/useViolationPipeline.test.ts`
Expected: All tests PASS (including the new one)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/hooks/useViolationPipeline.test.ts
git commit -m "test(anticheat): add externalCountdown recover-without-trigger test

Verifies that recovering without a prior trigger in externalCountdown
mode is a safe no-op."
```

---

### Task 8: T6 — webcamHandoffStore tests

**Files:**
- Create: `frontend/src/features/contest/anticheat/webcamHandoffStore.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearPrecheckWebcamHandoff,
  clearRuntimeWebcamHandoff,
  consumeRuntimeWebcamHandoff,
  setRuntimeWebcamHandoff,
  setPrecheckWebcamHandoff,
  consumePrecheckWebcamHandoff,
} from "./webcamHandoffStore";

type MockTrack = {
  stop: ReturnType<typeof vi.fn>;
};

const createMockStream = () => {
  const track: MockTrack = { stop: vi.fn() };
  return {
    getTracks: () => [track],
    track,
  };
};

afterEach(() => {
  clearPrecheckWebcamHandoff(true);
  clearRuntimeWebcamHandoff(true);
});

describe("webcamHandoffStore runtime", () => {
  it("preserves stream without stopping tracks when consumed", () => {
    const stream = createMockStream();
    setRuntimeWebcamHandoff(stream as unknown as MediaStream);

    const consumed = consumeRuntimeWebcamHandoff();
    expect(consumed).toBe(stream);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it("stops tracks when runtime handoff is cleared", () => {
    const stream = createMockStream();
    setRuntimeWebcamHandoff(stream as unknown as MediaStream);

    clearRuntimeWebcamHandoff(true);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(consumeRuntimeWebcamHandoff()).toBeNull();
  });

  it("does not stop tracks when cleared with stopTracks=false", () => {
    const stream = createMockStream();
    setRuntimeWebcamHandoff(stream as unknown as MediaStream);

    clearRuntimeWebcamHandoff(false);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it("returns null when no handoff is set", () => {
    expect(consumeRuntimeWebcamHandoff()).toBeNull();
  });
});

describe("webcamHandoffStore precheck", () => {
  it("set and consume precheck handoff", () => {
    const stream = createMockStream();
    setPrecheckWebcamHandoff(stream as unknown as MediaStream);

    const consumed = consumePrecheckWebcamHandoff();
    expect(consumed).toBe(stream);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it("stops tracks when precheck handoff is cleared", () => {
    const stream = createMockStream();
    setPrecheckWebcamHandoff(stream as unknown as MediaStream);

    clearPrecheckWebcamHandoff(true);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(consumePrecheckWebcamHandoff()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/anticheat/webcamHandoffStore.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/anticheat/webcamHandoffStore.test.ts
git commit -m "test(anticheat): add webcamHandoffStore tests

Covers runtime and precheck handoff: set/consume/clear lifecycle, track
stop behavior, and null-when-empty."
```

---

### Task 9: T1 — useScreenShareMonitoring tests

**Files:**
- Create: `frontend/src/features/contest/hooks/useScreenShareMonitoring.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useScreenShareMonitoring } from "./useScreenShareMonitoring";

// --- Mocks ---
const mockRecordExamEvent = vi.fn().mockResolvedValue(undefined);
const mockRecordExamEventWithForcedCapture = vi.fn().mockResolvedValue(undefined);

vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: (...args: unknown[]) => mockRecordExamEvent(...args),
}));

vi.mock("@/features/contest/anticheat/forcedCapture", () => ({
  recordExamEventWithForcedCapture: (...args: unknown[]) =>
    mockRecordExamEventWithForcedCapture(...args),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn().mockReturnValue(null),
}));

// We need runtimeReauthState to be real (not mocked) since
// useScreenShareMonitoring drives it directly.
// But we mock isRuntimeScreenShareReauthActive for the pipeline's default suppression check.
const mockIsReauthActive = vi.fn().mockReturnValue(false);

vi.mock("@/features/contest/anticheat/runtimeReauthState", async () => {
  const actual = await vi.importActual("@/features/contest/anticheat/runtimeReauthState");
  return {
    ...actual,
    // The pipeline's default isSuppressed calls this, but screen share monitoring
    // overrides isSuppressed to () => false, so this mock won't actually suppress.
    isRuntimeScreenShareReauthActive: (...args: unknown[]) => mockIsReauthActive(...args),
  };
});

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  contestId: "contest-1",
  enabled: true,
  examSubmitted: false,
  monitoringDisabled: false,
  moduleRole: "primary",
  requestForceSubmit: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("useScreenShareMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("onStreamLost triggers pipeline and starts reauth", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => { result.current.onStreamLost(); });

    expect(result.current.reauth.active).toBe(true);
    expect(result.current.reauth.inProgress).toBe(true);
    expect(mockRecordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "screen_share_interrupted",
      expect.objectContaining({ source: "anticheat:screen_capture" }),
    );
  });

  it("onStreamRestored cancels reauth and recovers pipeline", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => { result.current.onStreamLost(); });
    act(() => { result.current.onStreamRestored(); });

    expect(result.current.reauth.inProgress).toBe(false);
    expect(mockRecordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "screen_share_restored",
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "user_reshared" }),
      }),
    );
  });

  it("duplicate onStreamLost while already active is ignored", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => { result.current.onStreamLost(); });
    mockRecordExamEvent.mockClear();
    act(() => { result.current.onStreamLost(); });

    // Second call should not record another interrupted event
    const interruptedCalls = mockRecordExamEvent.mock.calls.filter(
      (c: unknown[]) => c[1] === "screen_share_interrupted",
    );
    expect(interruptedCalls).toHaveLength(0);
  });

  it("disabled=true prevents onStreamLost from triggering", () => {
    const config = makeConfig({ enabled: false });
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => { result.current.onStreamLost(); });

    expect(result.current.reauth.active).toBe(false);
    expect(mockRecordExamEvent).not.toHaveBeenCalled();
  });

  it("examSubmitted clears reauth state", () => {
    const config = makeConfig();
    const { result, rerender } = renderHook(
      (props) => useScreenShareMonitoring(props),
      { initialProps: config },
    );

    act(() => { result.current.onStreamLost(); });
    expect(result.current.reauth.active).toBe(true);

    rerender({ ...config, examSubmitted: true });

    expect(result.current.reauth.active).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/hooks/useScreenShareMonitoring.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/hooks/useScreenShareMonitoring.test.ts
git commit -m "test(anticheat): add useScreenShareMonitoring tests

Covers stream lost/restored lifecycle, duplicate trigger idempotency,
disabled guard, and examSubmitted cleanup."
```

---

### Task 10: T2 — useWebcamMonitoring tests

**Files:**
- Create: `frontend/src/features/contest/hooks/useWebcamMonitoring.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWebcamMonitoring } from "./useWebcamMonitoring";

// --- Mocks ---
vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/contest/anticheat/forcedCapture", () => ({
  recordExamEventWithForcedCapture: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn().mockReturnValue(null),
}));

vi.mock("@/features/contest/anticheat/runtimeReauthState", () => ({
  isRuntimeScreenShareReauthActive: vi.fn().mockReturnValue(false),
}));

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  contestId: "contest-1",
  enabled: true,
  examSubmitted: false,
  isPrimary: true,
  moduleRole: "primary",
  streamActive: true,
  requestForceSubmit: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("useWebcamMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("onStreamLost triggers pipeline", () => {
    const config = makeConfig({ streamActive: false });
    const { result } = renderHook(() => useWebcamMonitoring(config));

    act(() => { result.current.onStreamLost(); });

    expect(result.current.recoveryCountdown).toBe(10); // webcam default 10s
  });

  it("onStreamRestored recovers pipeline", () => {
    const config = makeConfig({ streamActive: false });
    const { result } = renderHook(() => useWebcamMonitoring(config));

    act(() => { result.current.onStreamLost(); });
    act(() => { result.current.onStreamRestored("user_reauthorized"); });

    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("isPrimary=true uses default force_submit escalation", () => {
    const config = makeConfig({ isPrimary: true, streamActive: false });
    const { result } = renderHook(() => useWebcamMonitoring(config));

    act(() => { result.current.onStreamLost(); });
    act(() => { vi.advanceTimersByTime(10000); });

    expect(config.requestForceSubmit).toHaveBeenCalled();
  });

  it("isPrimary=false uses log_only escalation (no force submit)", () => {
    const config = makeConfig({ isPrimary: false, streamActive: false });
    const { result } = renderHook(() => useWebcamMonitoring(config));

    act(() => { result.current.onStreamLost(); });
    act(() => { vi.advanceTimersByTime(10000); });

    expect(config.requestForceSubmit).not.toHaveBeenCalled();
  });

  it("auto-restores when streamActive becomes true while interrupted", () => {
    const config = makeConfig({ streamActive: false });
    const { result, rerender } = renderHook(
      (props) => useWebcamMonitoring(props),
      { initialProps: config },
    );

    act(() => { result.current.onStreamLost(); });
    expect(result.current.recoveryCountdown).toBe(10);

    rerender({ ...config, streamActive: true });

    expect(result.current.recoveryCountdown).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/hooks/useWebcamMonitoring.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/contest/hooks/useWebcamMonitoring.test.ts
git commit -m "test(anticheat): add useWebcamMonitoring tests

Covers stream lost/restored, primary vs secondary escalation, and
auto-restore on streamActive change."
```

---

### Task 11: T7 — Verify FullscreenDetector tests still pass after R2

**Files:**
- Check: `frontend/src/features/contest/detectors/focusDetector.test.ts` (pattern reference)

- [ ] **Step 1: Run existing detector tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/detectors/`
Expected: All tests PASS. If any fullscreen detector tests fail due to R2 changes (removed TFunction parameter, changed events), update them.

- [ ] **Step 2: Run full useFullscreenMonitoring tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/hooks/useFullscreenMonitoring.test.ts`
Expected: All 6 tests PASS (these test the hook, not the detector class)

- [ ] **Step 3: Commit if any test updates were needed**

```bash
git add -A
git commit -m "test(anticheat): update detector tests for simplified FullscreenDetector"
```

---

### Task 12: Final verification — run all anticheat tests

- [ ] **Step 1: Run all anticheat-related tests**

Run: `cd /Users/quan/online_judge/frontend && npx vitest run src/features/contest/`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `cd /Users/quan/online_judge/frontend && npm run lint`
Expected: No new errors
