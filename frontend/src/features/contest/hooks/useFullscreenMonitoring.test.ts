import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFullscreenMonitoring } from "./useFullscreenMonitoring";

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

vi.mock("@/core/usecases/exam", () => ({
  isFullscreen: vi.fn().mockReturnValue(true),
}));

import { isFullscreen } from "@/core/usecases/exam";
const mockIsFullscreen = vi.mocked(isFullscreen);

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  contestId: "contest-1",
  enabled: true,
  examSubmitted: false,
  onViolation: vi.fn(),
  requestForceSubmit: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("useFullscreenMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsFullscreen.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fullscreen exit triggers pipeline + starts countdown", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useFullscreenMonitoring(config));

    // Simulate exit fullscreen
    mockIsFullscreen.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("fullscreenchange")); });
    act(() => { vi.advanceTimersByTime(100); }); // settlement

    expect(result.current.recoveryCountdown).toBe(3);
  });

  it("fullscreen re-enter recovers + cancels countdown", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useFullscreenMonitoring(config));

    // Exit fullscreen
    mockIsFullscreen.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("fullscreenchange")); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.recoveryCountdown).toBe(3);

    // Re-enter fullscreen
    mockIsFullscreen.mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event("fullscreenchange")); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("100ms settlement: rapid fullscreen change doesn't false-positive", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useFullscreenMonitoring(config));

    // Exit then immediately re-enter (within 100ms)
    mockIsFullscreen.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("fullscreenchange")); });

    // Before settlement, go back to fullscreen
    mockIsFullscreen.mockReturnValue(true);
    act(() => { vi.advanceTimersByTime(100); }); // settlement reads isFullscreen() = true

    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("enabled=false suppresses trigger", () => {
    const config = makeConfig({ enabled: false });
    const { result } = renderHook(() => useFullscreenMonitoring(config));

    mockIsFullscreen.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("fullscreenchange")); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("verifyIntegrity: synthetic event round-trip", () => {
    const config = makeConfig();
    renderHook(() => useFullscreenMonitoring(config));

    // Advance to trigger first integrity check
    act(() => { vi.advanceTimersByTime(10_000); });

    // No violation should be called (listener is intact)
    expect(config.onViolation).not.toHaveBeenCalledWith(
      "listener_tampered",
      expect.any(String),
    );
  });

  it("unmount cleans up listeners", () => {
    const config = makeConfig();
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useFullscreenMonitoring(config));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "fullscreenchange",
      expect.any(Function),
    );
  });
});
