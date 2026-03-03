import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useExamState } from "./useExamState";
import { recordExamEvent } from "@/infrastructure/api/repositories";

vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: vi.fn(),
}));

describe("useExamState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
