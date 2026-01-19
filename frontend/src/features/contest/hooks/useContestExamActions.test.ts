import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useContestExamActions } from "./useContestExamActions";

vi.mock("@/infrastructure/api/repositories", () => ({
  startExam: vi.fn(),
  leaveContest: vi.fn(),
  registerContest: vi.fn(),
  endExam: vi.fn(),
}));

import {
  startExam,
  leaveContest,
  registerContest,
  endExam,
} from "@/infrastructure/api/repositories";

const messages = {
  joinError: "join error",
  leaveError: "leave error",
  startError: "start error",
  endError: "end error",
  exitError: "exit error",
};

const baseContest = {
  id: "1",
  name: "Contest",
  startTime: "2024-01-01T00:00:00Z",
  endTime: "2024-01-01T01:00:00Z",
  status: "published",
  examModeEnabled: true,
  examStatus: "not_started",
} as any;

describe("useContestExamActions", () => {
  const navigate = vi.fn();
  const onError = vi.fn();
  const refreshContest = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts exam, enters fullscreen, refreshes, and navigates", async () => {
    vi.mocked(startExam).mockResolvedValue({ status: "started" } as any);

    const { result } = renderHook(() =>
      useContestExamActions({
        contest: baseContest,
        contestId: baseContest.id,
        hasEnded: false,
        refreshContest,
        confirmLeave: undefined,
        navigate,
        messages,
        onError,
      })
    );

    await act(async () => {
      await result.current.handleStartExam();
    });

    expect(startExam).toHaveBeenCalledWith(baseContest.id);
    await waitFor(() => {
      expect(refreshContest).toHaveBeenCalledTimes(1);
    });
    expect(navigate).toHaveBeenCalledWith(`/contests/${baseContest.id}/problems`);
    expect(onError).not.toHaveBeenCalled();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });

  it("leaves contest only when confirmation resolves true", async () => {
    vi.mocked(leaveContest).mockResolvedValue(undefined as any);
    const confirmLeave = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useContestExamActions({
        contest: baseContest,
        contestId: baseContest.id,
        hasEnded: false,
        refreshContest,
        confirmLeave,
        navigate,
        messages,
        onError,
      })
    );

    await act(async () => {
      await result.current.handleLeave();
    });

    expect(confirmLeave).toHaveBeenCalled();
    expect(leaveContest).toHaveBeenCalledWith(baseContest.id);
    expect(refreshContest).toHaveBeenCalled();
  });

  it("ends exam before exit and exits fullscreen", async () => {
    const contest = { ...baseContest, examStatus: "in_progress" };
    vi.mocked(endExam).mockResolvedValue(undefined as any);
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useContestExamActions({
        contest,
        contestId: contest.id,
        hasEnded: false,
        refreshContest,
        confirmLeave: undefined,
        navigate,
        messages,
        onError,
      })
    );

    await act(async () => {
      await result.current.handleExit();
    });

    expect(endExam).toHaveBeenCalledWith(contest.id);
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/contests");
  });
});

