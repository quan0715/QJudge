import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { joinContestUseCase } from "@/core/usecases/contest/joinContest.usecase";
import { enterExamUseCase } from "@/core/usecases/exam/enterExam.usecase";
import { leaveExamUseCase } from "@/core/usecases/exam/leaveExam.usecase";
import { contestRepository } from "@/infrastructure/api/repositories/contest.repository";
import {
  endExam,
  examSessionRepository,
  isSubmittedExamSessionResponse,
} from "@/infrastructure/api/repositories/exam.repository";
import {
  exitFullscreen,
  isFullscreen,
  requestFullscreen,
} from "@/infrastructure/browser/fullscreen";
import { useIntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";
import { emitIntegritySignalBestEffort } from "@/features/contest/anticheat/integrity/emitIntegritySignalBestEffort";
import { clearExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks/useExamPrecheckGate";
import {
  clearExamCaptureSessionId,
  getExamCaptureSessionId,
} from "@/shared/state/examCaptureSessionStore";
import {
  clearPrecheckScreenShareHandoff,
  clearRuntimeScreenShareHandoff,
} from "@/features/contest/anticheat/screenShareHandoffStore";
import {
  clearPrecheckWebcamHandoff,
  clearRuntimeWebcamHandoff,
} from "@/features/contest/anticheat/webcamHandoffStore";
import { shouldForceEndExamOnExit } from "@/features/contest/domain/contestRuntimePolicy";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import {
  beginAnticheatTermination,
  markAnticheatTerminal,
  syncAnticheatPhaseWithExamStatus,
} from "@/features/contest/anticheat/orchestrator";
import { clearRuntimeScreenShareReauth } from "@/features/contest/anticheat/runtimeReauthState";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";
import useExamSubmissionProgress from "@/features/contest/hooks/useExamSubmissionProgress";
import {
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "@/features/contest/domain/anticheatModulePolicy";
import {
  getClassroomContestDashboardPath,
  getClassroomContestPrecheckPath,
} from "@/features/contest/domain/contestRoutePolicy";

type RefreshFn = () => Promise<void>;
type ErrorHandler = (message: string) => void;

interface UseContestExamActionsParams {
  contest: ContestDetail | null;
  contestId?: string;
  hasEnded: boolean;
  refreshContest: RefreshFn;
  navigate: NavigateFunction;
  messages: {
    joinError: string;
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
  navigate,
  messages,
  onError,
}: UseContestExamActionsParams) => {
  const submissionProgress = useExamSubmissionProgress();
  const integrity = useIntegritySignalEmitter();
  const resolveMonitoringModules = useCallback((): {
    primarySourceModule: "screen_share" | "webcam";
  } => {
    const plan = resolveDeviceMonitoringPlan(
      detectAnticheatCapability(),
      contest?.anticheatDevicePolicy
    );
    return { primarySourceModule: plan.primarySourceModule };
  }, [contest?.anticheatDevicePolicy]);

  const cleanupExamArtifacts = useCallback((
    id: string,
    stopReason: "manual" | "submitted" = "manual",
  ) => {
    stopCaptureForContest(id, stopReason);
    clearExamCaptureSessionId(id);
    clearExamPrecheckPassed(id);
    clearRuntimeScreenShareReauth(id);
    clearRuntimeScreenShareHandoff(true);
    clearPrecheckScreenShareHandoff(true);
    clearRuntimeWebcamHandoff(true);
    clearPrecheckWebcamHandoff(true);
  }, []);

  const handleJoin = useCallback(
    async () => {
      if (!contest) return;

      const result = await joinContestUseCase({
        contestId: contest.id,
      }, contestRepository);

      if (result.success) {
        await refreshContest();
      } else {
        onError(result.error || messages.joinError);
      }
    },
    [contest, messages.joinError, onError, refreshContest]
  );

  const handleStartExam = useCallback(async () => {
    if (!contest || !contestId) return;
    clearRuntimeScreenShareReauth(contest.id);

    if (contest.cheatDetectionEnabled) {
      // Force every new start/resume attempt from dashboard to pass precheck again.
      clearExamPrecheckPassed(contest.id);
    }

    const module = getContestTypeModule(contest.contestType);
    const answeringEntryPath = module.student.getAnsweringEntryPath(contest.id, contest);
    const classroomId = contest.boundClassroomId;
    const precheckPath = classroomId
      ? getClassroomContestPrecheckPath(classroomId, contest.id)
      : undefined;

    const result = await enterExamUseCase({
      contestId: contest.id,
      cheatDetectionEnabled: contest.cheatDetectionEnabled,
      answeringEntryPath,
      precheckPath,
    }, examSessionRepository);

    if (result.success && result.navigateTo) {
      await refreshContest();
      navigate(result.navigateTo);
    } else {
      onError(result.error || messages.startError);
    }
  }, [contest, contestId, messages.startError, navigate, onError, refreshContest]);

  const handleEndExam = useCallback(async () => {
    if (!contest) return;
    const uploadSessionId = getExamCaptureSessionId(contest.id);
    const { primarySourceModule: sourceModule } = resolveMonitoringModules();

    const success = await submissionProgress.run({
      handlers: {
        recording: async () => {
          await emitIntegritySignalBestEffort(integrity, {
            eventType: "exam_submit_initiated",
            clientOccurredAtMs: Date.now(),
            payload: {
              source: "contest_dashboard:end_exam",
              module: sourceModule,
              module_role: "primary",
              ...(uploadSessionId ? { upload_session_id: uploadSessionId } : {}),
            },
          });
          beginAnticheatTermination(contest.id);
        },
        finalizing: async () => {
          const response = uploadSessionId
            ? await endExam(contest.id, {
                upload_session_id: uploadSessionId,
                source_module: sourceModule,
              })
            : await endExam(contest.id, {
                source_module: sourceModule,
              });
          if (!isSubmittedExamSessionResponse(response)) {
            throw new Error("Exam submission did not complete");
          }
          await refreshContest();
          markAnticheatTerminal(contest.id);
        },
      },
    });

    if (!success) {
      syncAnticheatPhaseWithExamStatus(contest.id, contest.examStatus);
      onError(messages.endError);
      return;
    }
    cleanupExamArtifacts(contest.id, "submitted");
  }, [
    cleanupExamArtifacts,
    contest,
    messages.endError,
    onError,
    refreshContest,
    submissionProgress,
    integrity,
    resolveMonitoringModules,
  ]);

  const handleExit = useCallback(async () => {
    if (!contestId || !contest) return;

    try {
      const shouldEndExam = shouldForceEndExamOnExit(contest, hasEnded);
      const uploadSessionId = getExamCaptureSessionId(contest.id);
      const { primarySourceModule: sourceModule } = resolveMonitoringModules();
      let navigateTo = contest.boundClassroomId
        ? getClassroomContestDashboardPath(contest.boundClassroomId, contest.id)
        : "/dashboard";

      if (shouldEndExam) {
        const success = await submissionProgress.run({
          handlers: {
            recording: async () => {
              await emitIntegritySignalBestEffort(integrity, {
                eventType: "exam_submit_initiated",
                clientOccurredAtMs: Date.now(),
                payload: {
                  source: "contest_dashboard:exit_exam",
                  module: sourceModule,
                  module_role: "primary",
                  ...(uploadSessionId ? { upload_session_id: uploadSessionId } : {}),
                },
              });
              beginAnticheatTermination(contest.id);
            },
            finalizing: async () => {
              const result = await leaveExamUseCase({
                contestId: contest.id,
                shouldEndExam,
                uploadSessionId: uploadSessionId || undefined,
                sourceModule,
                navigateTo,
              }, { ...examSessionRepository, exitFullscreen });
              if (!result.success) {
                throw new Error(result.error || "Failed to leave exam");
              }
              navigateTo = result.navigateTo;
              markAnticheatTerminal(contest.id);
            },
          },
        });

        if (!success) {
          syncAnticheatPhaseWithExamStatus(contest.id, contest.examStatus);
          onError(messages.exitError);
          return;
        }
      } else {
        const result = await leaveExamUseCase({
          contestId: contest.id,
          shouldEndExam: false,
          uploadSessionId: undefined,
          navigateTo,
        }, { ...examSessionRepository, exitFullscreen });
        if (!result.success) {
          onError(result.error || messages.exitError);
          return;
        }
        navigateTo = result.navigateTo;
      }

      cleanupExamArtifacts(contest.id, shouldEndExam ? "submitted" : "manual");
      navigate(navigateTo);
    } catch {
      syncAnticheatPhaseWithExamStatus(contest.id, contest.examStatus);
      onError(messages.exitError);
    }
  }, [
    cleanupExamArtifacts,
    contest,
    contestId,
    hasEnded,
    messages.exitError,
    navigate,
    onError,
    submissionProgress,
    integrity,
    resolveMonitoringModules,
  ]);

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
    handleStartExam,
    handleEndExam,
    handleExit,
    toggleFullscreen,
    submissionProgress,
  };
};
