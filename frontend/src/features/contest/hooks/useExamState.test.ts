import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useExamState } from "./useExamState";
import { recordExamEvent } from "@/infrastructure/api/repositories";

vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: vi.fn(),
}));

describe("useExamState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    contestId: "123",
    examStatus: "in_progress" as const,
    isBypassed: false,
    requestFullscreen: vi.fn(),
  };

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
    vi.mocked(recordExamEvent).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useExamState(defaultProps));

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });

    expect(recordExamEvent).toHaveBeenCalledWith("123", "window_blur", "Left window");
    expect(result.current.showWarning).toBe(true);
    expect(result.current.warningEventType).toBe("window_blur");
    expect(result.current.examState.violationCount).toBe(1);
    expect(result.current.warningCountdown).toBe(30);
  });

  it("refreshes contest after recording a violation", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(recordExamEvent).mockResolvedValue({
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
    vi.mocked(recordExamEvent)
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

    expect(recordExamEvent).toHaveBeenCalledTimes(2);
    expect(recordExamEvent).toHaveBeenNthCalledWith(
      2,
      "123",
      "tab_hidden",
      "Second event"
    );
  });

  it("retries recording when repository returns null response", async () => {
    vi.useFakeTimers();
    vi.mocked(recordExamEvent)
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce({
        violation_count: 1,
        max_cheat_warnings: 3,
        bypass: false,
      });
    const { result } = renderHook(() => useExamState(defaultProps));

    await act(async () => {
      await result.current.handleViolation("window_blur", "Retry me");
    });
    expect(recordExamEvent).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordExamEvent).toHaveBeenCalledTimes(2);
  });

  it("auto-locks by warning_timeout after 30 seconds without acknowledgement", async () => {
    vi.useFakeTimers();
    vi.mocked(recordExamEvent)
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
      useExamState({ ...defaultProps, onRefresh })
    );

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });
    expect(result.current.warningCountdown).toBe(30);

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordExamEvent).toHaveBeenNthCalledWith(
      2,
      "123",
      "warning_timeout",
      "Warning timeout: student did not acknowledge warning within 30 seconds"
    );
    expect(result.current.lastApiResponse?.locked).toBe(true);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("stops timeout countdown when user acknowledges warning", async () => {
    vi.useFakeTimers();
    vi.mocked(recordExamEvent).mockResolvedValue({
      violation_count: 1,
      max_cheat_warnings: 3,
      bypass: false,
      locked: false,
    });

    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExamState({ ...defaultProps, requestFullscreen: requestFullscreenMock })
    );

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });
    expect(result.current.warningCountdown).toBe(30);

    await act(async () => {
      await result.current.handleWarningClose();
    });

    await act(async () => {
      vi.advanceTimersByTime(31000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordExamEvent).toHaveBeenCalledTimes(1);
    expect(result.current.warningCountdown).toBe(null);
  });

  it("ignores violation if bypassed", async () => {
    const { result } = renderHook(() => useExamState({ ...defaultProps, isBypassed: true }));

    await act(async () => {
      await result.current.handleViolation("window_blur", "Left window");
    });

    expect(recordExamEvent).not.toHaveBeenCalled();
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
