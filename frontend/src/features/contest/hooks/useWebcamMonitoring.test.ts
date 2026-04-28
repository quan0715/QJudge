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
  onViolation: vi.fn(),
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

  it("onStreamLost triggers pipeline with countdown", () => {
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

  it("isPrimary=true records a penalized event instead of force submit", () => {
    const config = makeConfig({ isPrimary: true, streamActive: false });
    const { result } = renderHook(() => useWebcamMonitoring(config));

    act(() => { result.current.onStreamLost(); });
    act(() => { vi.advanceTimersByTime(10000); });

    expect(config.requestForceSubmit).not.toHaveBeenCalled();
    expect(config.onViolation).toHaveBeenCalledWith("webcam_stopped", "webcam_recovery_timeout");
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
