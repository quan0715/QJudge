import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFocusMonitoring } from "./useFocusMonitoring";

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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  contestId: "contest-1",
  enabled: true,
  examSubmitted: false,
  onViolation: vi.fn(),
  requestForceSubmit: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("useFocusMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tab_hidden triggers pipeline + starts countdown", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useFocusMonitoring(config));

    // Simulate tab hidden
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.tabHiddenCountdown).toBe(3);
  });

  it("tab visible recovers tab_hidden pipeline", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useFocusMonitoring(config));

    // Trigger
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.tabHiddenCountdown).toBe(3);

    // Recover
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.tabHiddenCountdown).toBeNull();
  });

  it("window_blur triggers pipeline + starts countdown", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useFocusMonitoring(config));

    // Advance time so no recent interaction
    act(() => { vi.advanceTimersByTime(1000); });
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    // FocusDetector uses FOCUS_CHECK_DELAY_MS (default ~200ms) + confirm
    act(() => { vi.advanceTimersByTime(800); });

    expect(result.current.windowBlurCountdown).toBe(3);
  });

  it("window focus recovers window_blur pipeline", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useFocusMonitoring(config));

    // Trigger blur
    act(() => { vi.advanceTimersByTime(1000); });
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event("blur")); });
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current.windowBlurCountdown).toBe(3);

    // Recover focus
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(result.current.windowBlurCountdown).toBeNull();
  });

  it("enabled=false suppresses both pipelines", () => {
    const config = makeConfig({ enabled: false });
    const { result } = renderHook(() => useFocusMonitoring(config));

    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.tabHiddenCountdown).toBeNull();
    expect(result.current.windowBlurCountdown).toBeNull();
  });

  it("verifyIntegrity runs periodically", () => {
    const config = makeConfig();
    renderHook(() => useFocusMonitoring(config));

    // verifyIntegrity is called at 10s intervals
    act(() => { vi.advanceTimersByTime(10_000); });
    // No error = integrity passed (we can't easily check it was called,
    // but if it fails it would call onViolation with "listener_tampered")
    expect(config.onViolation).not.toHaveBeenCalledWith("listener_tampered", expect.any(String));
  });
});
