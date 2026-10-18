import { useCallback, useMemo } from "react";
import type { TestRunCustomCase } from "@/core/ports/problem.repository";
import { INITIAL_EXECUTION_STATE, type ExecutionState, type ExecutionType } from "@/core/types/solver.types";
import { isRunActive } from "@/features/problems/contexts/judgeQueueStore";
import { useJudgeQueue } from "@/features/problems/contexts/useJudgeQueue";

export function useSubmission({ problemId, contestId, code, language, customTestCases }: {
  problemId?: string; contestId: string; code: string; language: string;
  customTestCases: TestRunCustomCase[];
}) {
  const { runs, displayed, start } = useJudgeQueue();

  const problemRuns = useMemo(() => runs.filter((run) => run.problemId === problemId), [runs, problemId]);
  const shownKey = problemId ? displayed[problemId] : undefined;
  const executionState: ExecutionState = problemRuns.find((run) => run.key === shownKey) ?? INITIAL_EXECUTION_STATE;

  const execute = useCallback(async (type: ExecutionType) => {
    if (!problemId) return;
    await start(type, { problemId, contestId, language, code, customTestCases });
  }, [problemId, contestId, language, code, customTestCases, start]);

  return {
    executionState,
    execute,
    hasPendingSubmission: problemRuns.some((run) => run.type === "submit" && isRunActive(run)),
    testRunning: problemRuns.some((run) => run.type === "test" && isRunActive(run)),
    submitting: problemRuns.some((run) => run.type === "submit" && run.status === "running"),
  };
}
