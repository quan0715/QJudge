import { useCallback, useEffect, useMemo } from "react";
import { useCopilotRun, useCopilotSessions } from "@copilot";
import { useTaskSession } from "@/features/ai-tasks/hooks/useTaskSession";
import { gradeExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";
import { selectEffectiveGradingRun } from "../../copilotGradingSelectors";
import type { GradingAnswerRow } from "../gradingTypes";
import {
  AI_GRADING_TASK_TYPE,
  useAiQuestionGrading,
  type AiSuggestion,
} from "../useAiQuestionGrading";

const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "awaiting-approval", "awaiting-answer"]);
const POLL_MS = 5_000;
const NO_SUGGESTIONS: Readonly<Record<string, AiSuggestion>> = {};

export interface QuestionSuggestions {
  suggestions: Readonly<Record<string, AiSuggestion>>;
  running: boolean;
  error?: string;
  start(rows: readonly GradingAnswerRow[], modelId?: string): Promise<void>;
  adopt(entries: readonly { row: GradingAnswerRow; score: number; feedback: string }[]): Promise<void>;
  skip(answerIds: readonly string[]): Promise<void>;
}

/**
 * Single-question AI suggestions for the workbench. `questionId` is null for a
 * question group: the suggestion flow grades one question at a time.
 */
export function useQuestionSuggestions(
  contestId: string,
  questionId: string | null,
  rows: readonly GradingAnswerRow[],
): QuestionSuggestions {
  const ai = useAiQuestionGrading();
  const { sessions, listStatus, activeSession, refresh: refreshSessions } = useCopilotSessions();
  const { state: runState } = useCopilotRun();
  const enabled = Boolean(contestId && questionId && rows.length > 0);
  const bound = Boolean(questionId && ai.sessionId && ai.trackedQuestionId === questionId);
  const sessionId = bound ? (ai.sessionId ?? null) : null;

  useTaskSession({
    taskType: AI_GRADING_TASK_TYPE,
    taskContext: useMemo(
      () => (enabled && questionId ? { contest_id: contestId, question_id: questionId } : null),
      [contestId, enabled, questionId],
    ),
    sessions: useMemo(
      () => sessions.map((session) => ({ id: session.id, context: session.metadata })),
      [sessions],
    ),
    isLoadingSessions: listStatus === "loading",
    boundSessionId: sessionId,
    isBoundForCurrentContext: bound,
    enabled,
    resolveKey: enabled ? `${contestId}:${questionId}:${rows.length}` : null,
    onMatch: async (matchedId) =>
      questionId ? ai.restore(matchedId, contestId, questionId, [...rows]) : null,
  });

  const running = useMemo(() => {
    if (!sessionId) return false;
    const run = selectEffectiveGradingRun({
      sessions,
      sessionId,
      activeSessionId: activeSession.id,
      activeRun: runState.status === "ready" ? null : runState.run,
    });
    return Boolean(run && ACTIVE_RUN_STATUSES.has(run.status));
  }, [activeSession.id, runState, sessionId, sessions]);

  const { refreshSuggestions } = ai;
  useEffect(() => {
    if (!sessionId || !questionId || rows.length === 0) return;
    const refresh = () => void refreshSuggestions(sessionId, questionId, [...rows]);
    refresh();
    if (!running) return;
    // The suggestion session is not the chat's active one, so its run status
    // only updates through the session list.
    const timer = window.setInterval(() => {
      refresh();
      void refreshSessions();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [questionId, refreshSessions, refreshSuggestions, rows, running, sessionId]);

  const start = useCallback(
    async (targetRows: readonly GradingAnswerRow[], modelId?: string) => {
      if (!questionId || targetRows.length === 0) return;
      const label = targetRows[0].questionLabel ?? String(targetRows[0].questionIndex);
      const started = await ai.start(contestId, questionId, [...targetRows], { modelId, title: `AI 建議 · Q${label}` });
      if (!started) throw new Error("AI 建議啟動失敗，請稍後再試");
      await refreshSessions();
    },
    [ai, contestId, questionId, refreshSessions],
  );

  const markSynced = useCallback(
    async (ids: string[]) => {
      if (ids.length && !(await ai.markAnswersSynced(ids))) {
        throw new Error(ai.error ?? "AI 建議狀態更新失敗");
      }
    },
    [ai],
  );

  const adopt = useCallback<QuestionSuggestions["adopt"]>(
    async (entries) => {
      const results = await Promise.allSettled(
        entries.map(({ row, score, feedback }) => gradeExamAnswer(contestId, row.id, { score, feedback })),
      );
      await markSynced(entries.filter((_, index) => results[index].status === "fulfilled").map(({ row }) => row.id));
      const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed) throw failed.reason;
    },
    [contestId, markSynced],
  );

  const skip = useCallback((answerIds: readonly string[]) => markSynced([...answerIds]), [markSynced]);

  return {
    suggestions: bound ? ai.resultsByAnswerId : NO_SUGGESTIONS,
    running,
    error: bound ? ai.error : undefined,
    start,
    adopt,
    skip,
  };
}
