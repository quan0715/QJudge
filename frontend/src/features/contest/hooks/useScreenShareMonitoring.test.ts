import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useScreenShareMonitoring } from "./useScreenShareMonitoring";
import { clearRuntimeScreenShareReauth } from "@/features/contest/anticheat/runtimeReauthState";

// --- Mocks ---
const mockRecordExamEvent = vi.fn().mockResolvedValue(undefined);
const mockRecordExamEventWithForcedCapture = vi
  .fn()
  .mockResolvedValue(undefined);

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

// --- Helpers ---
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
    // Clean up any leftover state from previous tests
    clearRuntimeScreenShareReauth("contest-1");
  });

  afterEach(() => {
    clearRuntimeScreenShareReauth("contest-1");
    vi.useRealTimers();
  });

  it("onStreamLost triggers pipeline and starts reauth", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => {
      result.current.onStreamLost();
    });

    expect(result.current.reauth.active).toBe(true);
    expect(result.current.reauth.inProgress).toBe(true);
    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "screen_share_interrupted",
      expect.objectContaining({
        source: "anticheat:screen_capture",
        captureOptions: {
          eventType: "screen_share_interrupted",
          modules: ["screen_share"],
        },
      }),
    );
  });

  it("onStreamRestored cancels reauth and recovers pipeline", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => {
      result.current.onStreamLost();
    });
    act(() => {
      result.current.onStreamRestored();
    });

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

    act(() => {
      result.current.onStreamLost();
    });
    mockRecordExamEventWithForcedCapture.mockClear();
    act(() => {
      result.current.onStreamLost();
    });

    // Second call should not record another interrupted event (pipeline guard)
    const interruptedCalls =
      mockRecordExamEventWithForcedCapture.mock.calls.filter(
        (c: unknown[]) => c[1] === "screen_share_interrupted",
      );
    expect(interruptedCalls).toHaveLength(0);
  });

  it("disabled=true prevents onStreamLost from triggering", () => {
    const config = makeConfig({ enabled: false });
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => {
      result.current.onStreamLost();
    });

    expect(result.current.reauth.active).toBe(false);
    expect(mockRecordExamEvent).not.toHaveBeenCalled();
  });

  it("examSubmitted clears reauth state", () => {
    const config = makeConfig();
    const { result, rerender } = renderHook(
      (props) => useScreenShareMonitoring(props),
      { initialProps: config },
    );

    act(() => {
      result.current.onStreamLost();
    });
    expect(result.current.reauth.active).toBe(true);

    rerender({ ...config, examSubmitted: true });

    expect(result.current.reauth.active).toBe(false);
  });

  it("monitoringDisabled clears reauth state", () => {
    const config = makeConfig();
    const { result, rerender } = renderHook(
      (props) => useScreenShareMonitoring(props),
      { initialProps: config },
    );

    act(() => {
      result.current.onStreamLost();
    });
    expect(result.current.reauth.active).toBe(true);

    rerender({ ...config, monitoringDisabled: true });

    expect(result.current.reauth.active).toBe(false);
  });

  it("countdown reaches zero records stopped event with evidence", () => {
    const requestForceSubmit = vi.fn().mockResolvedValue(undefined);
    const onEnvironmentPaused = vi.fn();
    const config = makeConfig({
      recoveryGraceMs: 3000,
      requestForceSubmit,
      onEnvironmentPaused,
    });
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => {
      result.current.onStreamLost();
    });
    expect(result.current.reauth.inProgress).toBe(true);

    // Advance timer past the recovery deadline — runtimeReauthState ticker fires every 300ms
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(requestForceSubmit).not.toHaveBeenCalled();
    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "screen_share_stopped",
      expect.objectContaining({
        captureOptions: {
          eventType: "screen_share_stopped",
          modules: ["screen_share"],
        },
      }),
    );
  });

  it("uses configured evidence modules when timeout records stopped event", () => {
    const requestForceSubmit = vi.fn().mockResolvedValue(undefined);
    const config = makeConfig({
      recoveryGraceMs: 3000,
      evidenceCaptureModules: ["screen_share", "webcam"],
      requestForceSubmit,
    });
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => {
      result.current.onStreamLost();
    });
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(requestForceSubmit).not.toHaveBeenCalled();
    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "screen_share_stopped",
      expect.objectContaining({
        captureOptions: {
          eventType: "screen_share_stopped",
          modules: ["screen_share", "webcam"],
        },
      }),
    );
  });

  it("onStreamRestored before timeout prevents force submit", () => {
    const requestForceSubmit = vi.fn().mockResolvedValue(undefined);
    const config = makeConfig({
      recoveryGraceMs: 5000,
      requestForceSubmit,
    });
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => {
      result.current.onStreamLost();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      result.current.onStreamRestored();
    });

    // Advance past original deadline
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(requestForceSubmit).not.toHaveBeenCalled();
    expect(result.current.reauth.inProgress).toBe(false);
  });

  it("unmount clears reauth state", () => {
    const config = makeConfig();
    const { result, unmount } = renderHook(() =>
      useScreenShareMonitoring(config),
    );

    act(() => {
      result.current.onStreamLost();
    });
    expect(result.current.reauth.active).toBe(true);

    unmount();

    // After unmount, runtimeReauth entry should be cleared
    // Verify by mounting a fresh hook and checking initial state is clean
    const { result: result2 } = renderHook(() =>
      useScreenShareMonitoring(config),
    );
    expect(result2.current.reauth.active).toBe(false);
  });

  it("reauth.remainingSeconds is non-null while countdown is active", () => {
    const config = makeConfig({ recoveryGraceMs: 10000 });
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    act(() => {
      result.current.onStreamLost();
    });

    expect(result.current.reauth.remainingSeconds).not.toBeNull();
    expect(result.current.reauth.remainingSeconds).toBeGreaterThan(0);
  });

  it("reauth.remainingSeconds is null when not active", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useScreenShareMonitoring(config));

    expect(result.current.reauth.remainingSeconds).toBeNull();
  });
});
