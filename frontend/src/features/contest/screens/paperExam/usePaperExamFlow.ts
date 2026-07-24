import { useState } from "react";
import { useParams } from "react-router-dom";
import { useContest } from "@/features/contest/contexts/ContestContext";
import {
  registerContest,
  startExam,
  endExam,
  isSubmittedExamSessionResponse,
} from "@/infrastructure/api/repositories";
import {
  clearExamCaptureSessionId,
  getExamCaptureSessionId,
} from "@/shared/state/examCaptureSessionStore";
import {
  beginAnticheatTermination,
  markAnticheatTerminal,
  resetAnticheatOrchestrator,
  syncAnticheatPhaseWithExamStatus,
} from "@/features/contest/anticheat/orchestrator";
import { useIntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";
import { emitIntegritySignalBestEffort } from "@/features/contest/anticheat/integrity/emitIntegritySignalBestEffort";
import {
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "@/features/contest/domain/anticheatModulePolicy";

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const usePaperExamFlow = () => {
  const { contestId } = useParams<{ contestId?: string }>();
  const { contest, refreshContest, loading: contextLoading } = useContest();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const integrity = useIntegritySignalEmitter();

  const guardContestId = (): string => {
    if (!contestId) {
      throw new Error("Contest ID is missing");
    }
    return contestId;
  };

  const clearError = () => setError(null);

  const register = async () => {
    const id = guardContestId();
    setLoading(true);
    setError(null);
    try {
      await registerContest(id);
      await refreshContest();
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "報名失敗"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startSession = async () => {
    const id = guardContestId();
    setLoading(true);
    setError(null);
    try {
      if (contest?.cheatDetectionEnabled) {
        clearExamCaptureSessionId(id);
        resetAnticheatOrchestrator(id);
      }
      // 考試模式只需 startExam，不需 enterContest
      // enterContest 會檢查 left_at（交卷時設定），導致已交卷的學生無法重新進入
      await startExam(id);
      await refreshContest();
      if (contest?.cheatDetectionEnabled) {
        syncAnticheatPhaseWithExamStatus(id, "in_progress");
      }
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "無法開始考試"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const submitExam = async (uploadSessionId?: string) => {
    const id = guardContestId();
    const monitoringPlan = resolveDeviceMonitoringPlan(
      detectAnticheatCapability(),
      contest?.anticheatDevicePolicy
    );
    const sourceModule = monitoringPlan.primarySourceModule;
    const moduleRole = sourceModule === "screen_share"
      ? monitoringPlan.sources.screenShare.role ?? "primary"
      : monitoringPlan.sources.webcam.role ?? "primary";
    setLoading(true);
    setError(null);
    try {
      if (contest?.cheatDetectionEnabled) {
        await emitIntegritySignalBestEffort(integrity, {
          eventType: "exam_submit_initiated",
          clientOccurredAtMs: Date.now(),
          payload: {
            source: "paper_exam:submit",
            module: sourceModule,
            module_role: moduleRole,
            ...(uploadSessionId || getExamCaptureSessionId(id)
              ? { upload_session_id: uploadSessionId || getExamCaptureSessionId(id)! }
              : {}),
          },
        });
        beginAnticheatTermination(id);
      }
      const response = await endExam(id, {
        upload_session_id: uploadSessionId || getExamCaptureSessionId(id) || undefined,
        source_module: sourceModule,
      });
      if (!isSubmittedExamSessionResponse(response)) {
        throw new Error("Exam submission did not complete");
      }
    } catch (err: unknown) {
      if (contest?.cheatDetectionEnabled) {
        syncAnticheatPhaseWithExamStatus(id, contest?.examStatus || "in_progress");
      }
      setError(getErrorMessage(err, "交卷失敗"));
      setLoading(false);
      return false;
    }
    await refreshContest();
    clearExamCaptureSessionId(id);
    if (contest?.cheatDetectionEnabled) {
      markAnticheatTerminal(id);
    }
    setLoading(false);
    return true;
  };

  return {
    contestId,
    contest,
    loading: loading || contextLoading,
    error,
    clearError,
    register,
    startSession,
    submitExam,
    refreshContest,
  };
};

export default usePaperExamFlow;
