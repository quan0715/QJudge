import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useExamState } from "./useExamState";
import { resetAnticheatOrchestrator } from "@/features/contest/anticheat/orchestrator";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import { endRuntimeScreenShareReauth } from "@/features/contest/anticheat/runtimeReauthState";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import type { ExamEventResponse } from "@/infrastructure/api/repositories/exam.repository";

vi.mock("@/features/contest/anticheat/forcedCapture", () => ({
  recordExamEventWithForcedCapture: vi.fn(),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn(),
}));

describe("useExamState", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const useStableFakeClock = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T00:00:00Z"));
    endRuntimeScreenShareReauth(0);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnticheatOrchestrator("123");
    endRuntimeScreenShareReauth(0);
    vi.mocked(getExamCaptureSessionId).mockReturnValue("session-123");
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    resetAnticheatOrchestrator("123");
    endRuntimeScreenShareReauth(0);
    consoleErrorSpy.mockRestore();
  });

  const defaultProps = {
    contestId: "123",
    examStatus: "in_progress" as const,
    isBypassed: false,
    requestFullscreen: vi.fn(),
  };

  const withContestId = (contestId: string) => ({
    ...defaultProps,
    contestId,
  });

  it("initializes with active state", () => {
    const { result } = renderHook(() => useExamState(defaultProps));

    expect(result.current.examState.isActive).toBe(true);
    expect(result.current.examState.isLocked).toBe(false);
  });

  it("handles violation correctly", async () => {
    const mockResponse = {
      violation_count: 1,
      max_cheat_warnings: 3,
      auto_unlock_at: undefined,
      bypass: false,
    };
    vi.mocked(recordExamEventWithForcedCapture).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useExamState(defaultProps));

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });

    expect(recordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "123",
      "window_blur",
      expect.objectContaining({
        reason: "Left window",
        metadata: expect.objectContaining({
          upload_session_id: "session-123",
        }),
      })
    );
    expect(result.current.showWarning).toBe(true);
    expect(result.current.warningEventType).toBe("window_blur");
    expect(result.current.examState.violationCount).toBe(1);
    expect(result.current.warningCountdown).toBe(30);
  });

  it("refreshes contest after recording a violation", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(recordExamEventWithForcedCapture).mockResolvedValue({
      violation_count: 1,
      max_cheat_warnings: 3,
      bypass: false,
    });
    const { result } = renderHook(() =>
      useExamState({ ...defaultProps, onRefresh })
    );

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not drop rapid consecutive violations", async () => {
    vi.mocked(recordExamEventWithForcedCapture)
      .mockResolvedValueOnce({
        violation_count: 1,
        max_cheat_warnings: 3,
        bypass: false,
      })
      .mockResolvedValueOnce({
        violation_count: 2,
        max_cheat_warnings: 3,
        bypass: false,
      });

    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExamState({ ...defaultProps, requestFullscreen: requestFullscreenMock })
    );

    await act(async () => {
      await result.current.handleViolation("window_blur", "First event");
    });
    await act(async () => {
      await result.current.handleViolation("tab_hidden", "Second event");
    });

    expect(recordExamEventWithForcedCapture).toHaveBeenCalledTimes(2);
    expect(recordExamEventWithForcedCapture).toHaveBeenNthCalledWith(
      2,
      "123",
      "tab_hidden",
      expect.objectContaining({ reason: "Second event" })
    );
  });

  it("records an error state when repository returns null response", async () => {
    const props = withContestId("retry-123");
    resetAnticheatOrchestrator(props.contestId);
    useStableFakeClock();
    vi.mocked(recordExamEventWithForcedCapture)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        violation_count: 1,
        max_cheat_warnings: 3,
        bypass: false,
      });
    const { result } = renderHook(() => useExamState(props));

    await act(async () => {
      await result.current.handleViolation("window_blur", "Retry me");
    });
    expect(recordExamEventWithForcedCapture).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(recordExamEventWithForcedCapture).toHaveBeenCalledTimes(1);
    expect(result.current.lastApiResponse?.error).toBe(true);
    expect(result.current.lastApiResponse?.message).toContain("Failed to record exam event");
  });

  it("auto-locks by warning_timeout after 30 seconds without acknowledgement", async () => {
    const props = withContestId("timeout-123");
    resetAnticheatOrchestrator(props.contestId);
    useStableFakeClock();
    vi.mocked(recordExamEventWithForcedCapture)
      .mockResolvedValueOnce({
        violation_count: 1,
        max_cheat_warnings: 3,
        bypass: false,
        locked: false,
      })
      .mockResolvedValueOnce({
        violation_count: 2,
        max_cheat_warnings: 3,
        bypass: false,
        locked: true,
      });

    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExamState({ ...props, onRefresh })
    );

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });
    expect(result.current.warningCountdown).toBe(30);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(recordExamEventWithForcedCapture).toHaveBeenNthCalledWith(
      2,
      props.contestId,
      "warning_timeout",
      expect.objectContaining({
        reason: "Warning timeout: student did not acknowledge warning within 30 seconds",
        metadata: expect.objectContaining({
          upload_session_id: "session-123",
        }),
      })
    );
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("stops timeout countdown when user acknowledges warning", async () => {
    const props = withContestId("ack-123");
    resetAnticheatOrchestrator(props.contestId);
    useStableFakeClock();
    vi.mocked(recordExamEventWithForcedCapture).mockResolvedValue({
      violation_count: 1,
      max_cheat_warnings: 3,
      bypass: false,
      locked: false,
    });

    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExamState({ ...props, requestFullscreen: requestFullscreenMock })
    );

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });

    await act(async () => {
      await result.current.handleWarningClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31000);
    });

    expect(recordExamEventWithForcedCapture).toHaveBeenCalledTimes(1);
    expect(result.current.warningCountdown).toBe(null);
  });

  it("ignores violation if bypassed", async () => {
    const { result } = renderHook(() => useExamState({ ...defaultProps, isBypassed: true }));

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });

    expect(recordExamEventWithForcedCapture).not.toHaveBeenCalled();
    expect(result.current.showWarning).toBe(false);
  });

  it("records violations in locked state without opening warning modal", async () => {
    const lockedResponse: ExamEventResponse = {
      violation_count: 4,
      max_cheat_warnings: 3,
      bypass: false,
      exam_status: "submitted",
    };
    vi.mocked(recordExamEventWithForcedCapture).mockResolvedValue(lockedResponse);

    const { result } = renderHook(() =>
      useExamState({ ...defaultProps, examStatus: "locked" })
    );

    await act(async () => {
      await result.current.handleViolation("tab_hidden", "locked state event");
    });

    expect(recordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "123",
      "tab_hidden",
      expect.objectContaining({ reason: "locked state event" })
    );
    expect(result.current.showWarning).toBe(false);
  });

  it("closes warning and requests fullscreen", async () => {
    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExamState({ ...defaultProps, requestFullscreen: requestFullscreenMock })
    );

    // Simulate warning state
    await act(async () => {
      // Direct call since handleViolation requires awaiting API
      result.current.handleWarningClose();
    });

    expect(requestFullscreenMock).toHaveBeenCalled();
    expect(result.current.showWarning).toBe(false);
  });
});
