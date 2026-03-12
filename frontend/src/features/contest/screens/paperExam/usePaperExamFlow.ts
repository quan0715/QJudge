import { useState } from "react";
import { useParams } from "react-router-dom";
import { usePaperExam } from "@/features/contest/contexts/PaperExamContext";
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
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const usePaperExamFlow = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest, refreshContest } = usePaperExam();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardContestId = (): string => {
    if (!contestId) {
      throw new Error("Contest ID is missing");
    }
    return contestId;
  };

  const clearError = () => setError(null);

  const register = async (data?: { nickname?: string; password?: string }) => {
    const id = guardContestId();
    setLoading(true);
    setError(null);
    try {
      await registerContest(id, data);
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
      clearExamCaptureSessionId(id);
      resetAnticheatOrchestrator(id);
      // 考試模式只需 startExam，不需 enterContest
      // enterContest 會檢查 left_at（交卷時設定），導致已交卷的學生無法重新進入
      await startExam(id);
      await refreshContest();
      syncAnticheatPhaseWithExamStatus(id, "in_progress");
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
    setLoading(true);
    setError(null);
    try {
      await recordExamEventWithForcedCapture(id, "exam_submit_initiated", {
        reason: "Student submitted paper exam from answering screen",
        source: "paper_exam:submit",
        forceCaptureReason: "exam_submit_initiated:paper_exam_submit",
        metadata: {
          upload_session_id: uploadSessionId || getExamCaptureSessionId(id) || undefined,
        },
      }).catch(() => null);
      beginAnticheatTermination(id);
      const response = await endExam(id, {
        upload_session_id: uploadSessionId || getExamCaptureSessionId(id) || undefined,
      });
      if (!isSubmittedExamSessionResponse(response)) {
        throw new Error("Exam submission did not complete");
      }
    } catch (err: unknown) {
      syncAnticheatPhaseWithExamStatus(id, contest?.examStatus || "in_progress");
      setError(getErrorMessage(err, "交卷失敗"));
      setLoading(false);
      return false;
    }
    await refreshContest();
    clearExamCaptureSessionId(id);
    markAnticheatTerminal(id);
    setLoading(false);
    return true;
  };

  return {
    contestId,
    contest,
    loading,
    error,
    clearError,
    register,
    startSession,
    submitExam,
    refreshContest,
  };
};

export default usePaperExamFlow;
