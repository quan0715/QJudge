import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useContestTimers } from "./useContestTimers";

const baseContest = {
  id: "1",
  name: "Contest",
  startTime: "2024-01-01T00:00:00Z",
  endTime: "2024-01-01T01:00:00Z",
  status: "published",
  examModeEnabled: false,
  examStatus: "not_started",
} as any;

describe("useContestTimers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down to start then triggers a single refresh when reaching start", async () => {
    const contest = {
      ...baseContest,
      startTime: "2024-01-01T00:00:02Z",
      endTime: "2024-01-01T00:00:07Z",
    };
    const refreshContest = vi.fn();

    const { result } = renderHook(() =>
      useContestTimers({ contest, contestId: contest.id, refreshContest })
    );

    expect(result.current.isCountdownToStart).toBe(true);
    expect(result.current.timeLeft).toBe("00:00:02");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.isCountdownToStart).toBe(false);
    expect(result.current.timeLeft).toBe("00:00:05");
    expect(refreshContest).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(refreshContest).toHaveBeenCalledTimes(1);
    expect(result.current.timeLeft).toBe("00:00:00");
  });

  it("counts down unlock timer and refreshes once when unlocked", async () => {
    const contest = {
      ...baseContest,
      examModeEnabled: true,
      examStatus: "locked",
      autoUnlockAt: "2024-01-01T00:00:03Z",
    };
    const refreshContest = vi.fn();

    const { result } = renderHook(() =>
      useContestTimers({ contest, contestId: contest.id, refreshContest })
    );

    expect(result.current.unlockTimeLeft).toBe("00:00:03");

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(refreshContest).toHaveBeenCalledTimes(1);
    expect(result.current.unlockTimeLeft).toBe("00:00:00");
  });
});
