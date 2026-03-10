import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  enterExamUseCase,
  leaveExamUseCase,
  requestFullscreen,
  exitFullscreen,
  isFullscreen,
} from "@/core/usecases/exam";
import {
  joinContestUseCase,
  leaveContestUseCase,
} from "@/core/usecases/contest";
import { endExam } from "@/infrastructure/api/repositories";
import { isSubmittedExamSessionResponse } from "@/infrastructure/api/repositories/exam.repository";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import { clearExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks/useExamPrecheckGate";
import {
  clearExamCaptureSessionId,
  getExamCaptureSessionId,
} from "@/features/contest/screens/paperExam/hooks/examCaptureSession";
import { shouldForceEndExamOnExit } from "@/features/contest/domain/contestRuntimePolicy";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import {
  beginAnticheatTermination,
  markAnticheatTerminal,
  syncAnticheatPhaseWithExamStatus,
} from "@/features/contest/anticheat/orchestrator";
import { clearRuntimeScreenShareReauth } from "@/features/contest/anticheat/runtimeReauthState";

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
    clearRuntimeScreenShareReauth(contest.id);

    if (contest.cheatDetectionEnabled) {
      // Force every new start/resume attempt from dashboard to pass precheck again.
      clearExamPrecheckPassed(contest.id);
    }

    const module = getContestTypeModule(contest.contestType);
    const answeringEntryPath = module.student.getAnsweringEntryPath(contest.id, contest);

    const result = await enterExamUseCase({
      contestId: contest.id,
      cheatDetectionEnabled: contest.cheatDetectionEnabled,
      answeringEntryPath,
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
      const uploadSessionId = getExamCaptureSessionId(contest.id);
      await recordExamEventWithForcedCapture(contest.id, "exam_submit_initiated", {
        reason: "Student initiated exam submission from contest dashboard",
        source: "contest_dashboard:end_exam",
        forceCaptureReason: "exam_submit_initiated:dashboard_submit",
        metadata: {
          upload_session_id: uploadSessionId || undefined,
        },
      }).catch(() => null);
      beginAnticheatTermination(contest.id);
      const response = uploadSessionId
        ? await endExam(contest.id, { upload_session_id: uploadSessionId })
        : await endExam(contest.id);
      if (!isSubmittedExamSessionResponse(response)) {
        throw new Error("Exam submission did not complete");
      }
    } catch {
      syncAnticheatPhaseWithExamStatus(contest.id, contest.examStatus);
      onError(messages.endError);
      return;
    }
    clearExamCaptureSessionId(contest.id);
    clearExamPrecheckPassed(contest.id);
    clearRuntimeScreenShareReauth(contest.id);
    await refreshContest();
    markAnticheatTerminal(contest.id);
  }, [contest, messages.endError, onError, refreshContest]);

  const handleExit = useCallback(async () => {
    if (!contestId || !contest) return;

    try {
      const shouldEndExam = shouldForceEndExamOnExit(contest, hasEnded);
      const uploadSessionId = getExamCaptureSessionId(contest.id);
      if (shouldEndExam) {
        await recordExamEventWithForcedCapture(contest.id, "exam_submit_initiated", {
          reason: "Exam auto-submitted because student exited the monitored exam flow",
          source: "contest_dashboard:exit_exam",
          forceCaptureReason: "exam_submit_initiated:exit_exam",
          metadata: {
            upload_session_id: uploadSessionId || undefined,
          },
        }).catch(() => null);
        beginAnticheatTermination(contest.id);
      }

      const result = await leaveExamUseCase({
        contestId: contest.id,
        shouldEndExam,
      });

      if (contest.cheatDetectionEnabled) {
        clearExamPrecheckPassed(contest.id);
      }
      clearExamCaptureSessionId(contest.id);
      clearRuntimeScreenShareReauth(contest.id);
      if (shouldEndExam) {
        markAnticheatTerminal(contest.id);
      }
      navigate(result.navigateTo);
    } catch {
      syncAnticheatPhaseWithExamStatus(contest.id, contest.examStatus);
      onError(messages.exitError);
    }
  }, [contest, contestId, hasEnded, messages.exitError, navigate, onError]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!isFullscreen()) {
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
