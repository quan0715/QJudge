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
  } satisfies {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    status: string;
    examModeEnabled: boolean;
    examStatus: string;
  };

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

  it("exam mode start routes to precheck and refreshes contest", async () => {
    vi.mocked(startExam).mockResolvedValue({ status: "started" } as { status: string });

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

    expect(startExam).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(refreshContest).toHaveBeenCalledTimes(1);
    });
    expect(navigate).toHaveBeenCalledWith(
      `/contests/${baseContest.id}/paper-exam/precheck`
    );
    expect(onError).not.toHaveBeenCalled();
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });

  it("leaves contest only when confirmation resolves true", async () => {
    vi.mocked(leaveContest).mockResolvedValue(undefined as void);
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
    vi.mocked(endExam).mockResolvedValue(undefined as void);
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
