import { useState } from "react";
import { useParams } from "react-router-dom";
import { useContest } from "@/features/contest/contexts/ContestContext";
import {
  registerContest,
  enterContest,
  startExam,
  endExam,
  sendExamHeartbeat,
} from "@/infrastructure/api/repositories";

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const useExamV2Flow = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest, refreshContest } = useContest();
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
      await enterContest(id);
      await startExam(id);
      await refreshContest();
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "無法開始考試"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const submitExam = async () => {
    const id = guardContestId();
    setLoading(true);
    setError(null);
    try {
      await endExam(id);
      await refreshContest();
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "交卷失敗"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const heartbeat = async () => {
    const id = guardContestId();
    return sendExamHeartbeat(id, {
      is_focused: document.hasFocus(),
      is_fullscreen: !!document.fullscreenElement,
    });
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
    heartbeat,
    refreshContest,
  };
};

export default useExamV2Flow;
