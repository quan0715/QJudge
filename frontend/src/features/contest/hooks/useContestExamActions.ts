import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  enterExamUseCase,
  leaveExamUseCase,
  requestFullscreen,
  exitFullscreen,
} from "@/core/usecases/exam";
import {
  joinContestUseCase,
  leaveContestUseCase,
} from "@/core/usecases/contest";
import { endExam } from "@/infrastructure/api/repositories";

type ConfirmLeaveFn = (() => Promise<boolean>) | undefined;
type RefreshFn = () => Promise<void>;
type ErrorHandler = (message: string) => void;

interface UseContestExamActionsParams {
  contest: ContestDetail | null;
  contestId?: string;
  hasEnded: boolean;
  refreshContest: RefreshFn;
  confirmLeave?: ConfirmLeaveFn;
  navigate: NavigateFunction;
  messages: {
    joinError: string;
    leaveError: string;
    startError: string;
    endError: string;
    exitError: string;
  };
  onError: ErrorHandler;
}

// Re-export fullscreen utilities for backward compatibility
export { requestFullscreen, exitFullscreen };

export const useContestExamActions = ({
  contest,
  contestId,
  hasEnded,
  refreshContest,
  confirmLeave,
  navigate,
  messages,
  onError,
}: UseContestExamActionsParams) => {
  const handleJoin = useCallback(
    async (data?: { nickname?: string; password?: string }) => {
      if (!contest) return;

      const result = await joinContestUseCase({
        contestId: contest.id,
        password: data?.password,
        nickname: data?.nickname,
      });

      if (result.success) {
        await refreshContest();
      } else {
        onError(result.error || messages.joinError);
      }
    },
    [contest, messages.joinError, onError, refreshContest]
  );

  const handleLeave = useCallback(async () => {
    if (!contest) return;
    if (confirmLeave) {
      const confirmed = await confirmLeave();
      if (!confirmed) return;
    }

    const result = await leaveContestUseCase({ contestId: contest.id });

    if (result.success) {
      await refreshContest();
    } else {
      onError(result.error || messages.leaveError);
    }
  }, [confirmLeave, contest, messages.leaveError, onError, refreshContest]);

  const handleStartExam = useCallback(async () => {
    if (!contest || !contestId) return;

    const result = await enterExamUseCase({
      contestId: contest.id,
      examModeEnabled: contest.examModeEnabled,
    });

    if (result.success && result.navigateTo) {
      await refreshContest();
      navigate(result.navigateTo);
    } else {
      onError(result.error || messages.startError);
    }
  }, [contest, contestId, messages.startError, navigate, onError, refreshContest]);

  const handleEndExam = useCallback(async () => {
    if (!contest) return;
    try {
      await endExam(contest.id);
      await refreshContest();
    } catch {
      onError(messages.endError);
    }
  }, [contest, messages.endError, onError, refreshContest]);

  const handleExit = useCallback(async () => {
    if (!contestId || !contest) return;

    try {
      const shouldEndExam =
        contest.examModeEnabled &&
        contest.status === "published" &&
        !hasEnded &&
        (contest.examStatus === "in_progress" ||
          contest.examStatus === "paused" ||
          contest.examStatus === "locked");

      const result = await leaveExamUseCase({
        contestId: contest.id,
        shouldEndExam,
      });

      navigate(result.navigateTo);
    } catch {
      onError(messages.exitError);
    }
  }, [contest, contestId, hasEnded, messages.exitError, navigate, onError]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await requestFullscreen();
      } else {
        await exitFullscreen();
      }
    } catch (error) {
      console.error("Error toggling fullscreen:", error);
    }
  }, []);

  return {
    handleJoin,
    handleLeave,
    handleStartExam,
    handleEndExam,
    handleExit,
    toggleFullscreen,
  };
};
