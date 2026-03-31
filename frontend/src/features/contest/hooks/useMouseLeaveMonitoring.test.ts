import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMouseLeaveMonitoring } from "./useMouseLeaveMonitoring";

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
  onViolation: vi.fn(),
  requestForceSubmit: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const fireMouseLeave = (relatedTarget: EventTarget | null = null) => {
  const event = new MouseEvent("mouseleave", {
    bubbles: false,
    relatedTarget,
  });
  document.documentElement.dispatchEvent(event);
};

const fireMouseEnter = () => {
  document.documentElement.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
};

describe("useMouseLeaveMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mouse leave triggers pipeline + starts countdown", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useMouseLeaveMonitoring(config));

    act(() => { fireMouseLeave(null); });

    expect(result.current.recoveryCountdown).toBe(3);
  });

  it("mouse re-enter recovers + cancels countdown", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useMouseLeaveMonitoring(config));

    act(() => { fireMouseLeave(null); });
    expect(result.current.recoveryCountdown).toBe(3);

    act(() => { fireMouseEnter(); });
    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("IME composition guard suppresses trigger within 900ms", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useMouseLeaveMonitoring(config));

    // Start and end composition
    act(() => { document.dispatchEvent(new Event("compositionstart")); });
    act(() => { document.dispatchEvent(new Event("compositionend")); });

    // Mouse leave within 900ms of composition end
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { fireMouseLeave(null); });

    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("cooldown suppresses second trigger within grace window", () => {
    const config = makeConfig({ cooldownMs: 3000 });
    const { result } = renderHook(() => useMouseLeaveMonitoring(config));

    // First trigger
    act(() => { fireMouseLeave(null); });
    expect(result.current.recoveryCountdown).toBe(3);

    // Recover
    act(() => { fireMouseEnter(); });
    expect(result.current.recoveryCountdown).toBeNull();

    // Second trigger within cooldown — suppressed by pipeline's idempotency
    // (isInterrupted is false after recover, but cooldown in our hook also guards)
    act(() => { vi.advanceTimersByTime(1000); }); // only 1s passed, cooldown is 3s
    act(() => { fireMouseLeave(null); });

    // The cooldown guard in the hook itself blocks this
    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("relatedTarget !== null suppresses trigger", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useMouseLeaveMonitoring(config));

    // Create a target element to simulate moving to a child element
    const target = document.createElement("div");
    act(() => { fireMouseLeave(target); });

    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("enabled=false suppresses trigger", () => {
    const config = makeConfig({ enabled: false });
    const { result } = renderHook(() => useMouseLeaveMonitoring(config));

    act(() => { fireMouseLeave(null); });
    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("isTablet=true suppresses mouse-leave trigger", () => {
    const config = makeConfig({ isTablet: true });
    const { result } = renderHook(() => useMouseLeaveMonitoring(config));

    act(() => { fireMouseLeave(null); });
    expect(result.current.recoveryCountdown).toBeNull();
  });
});
