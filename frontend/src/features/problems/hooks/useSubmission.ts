import { useCallback, useEffect, useRef, useState } from "react";
import { submitSolution, getSubmission } from "@/infrastructure/api/repositories/submission.repository";
import { testRun, getTestRunProgress } from "@/infrastructure/api/repositories/problem.repository";
import type { SubmissionDetail } from "@/core/entities/submission.entity";
import type { TestRunResult } from "@/core/ports/problem.repository";
import { INITIAL_EXECUTION_STATE, type ExecutionState, type ExecutionType } from "@/core/types/solver.types";
import { transformSubmissionToResult, transformTestRunToResult } from "./solverAdapters";

type Snapshot = Pick<ExecutionState, "result" | "pollingId">;
const fromTest = (data: TestRunResult, runId?: string, total?: number): Snapshot => ({
  result: transformTestRunToResult({ ...data, total: data.execution_status === "complete" ? undefined : data.total ?? total }),
  pollingId: data.execution_status === "complete" ? undefined : data.run_id ?? runId,
});
const fromSubmission = (data: SubmissionDetail): Snapshot => ({
  result: transformSubmissionToResult(data),
  pollingId: ["pending", "judging"].includes(data.status) ? data.id : undefined,
});

export function useSubmission({ problemId, contestId, code, language }: {
  problemId?: string; contestId: string; code: string; language: string;
}) {
  const [executionState, setState] = useState<ExecutionState>(INITIAL_EXECUTION_STATE);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setState(INITIAL_EXECUTION_STATE);
    return () => { generation.current += 1; };
  }, [problemId, contestId]);

  const apply = useCallback((type: ExecutionType, snapshot: Snapshot) => {
    busy.current = !!snapshot.pollingId;
    setState({ type, ...snapshot, status: snapshot.pollingId ? "polling" : "complete" });
  }, []);
  const fail = useCallback((error: unknown) => {
    busy.current = false;
    setState(previous => ({ ...previous, status: "error", pollingId: undefined,
      error: error instanceof Error ? error.message : "執行失敗",
    }));
  }, []);

  const execute = useCallback(async (type: ExecutionType) => {
    if (!problemId || busy.current) return;
    busy.current = true;
    const run = ++generation.current;
    setState({ type, status: "running", result: null });
    try {
      const payload = { language, code, contest_id: contestId };
      const snapshot = type === "test"
        ? fromTest(await testRun(problemId, { ...payload, asynchronous: true }))
        : fromSubmission(await submitSolution({ ...payload, problem_id: problemId }));
      if (generation.current === run) apply(type, snapshot);
    } catch (error) { if (generation.current === run) fail(error); }
  }, [problemId, contestId, language, code, apply, fail]);

  useEffect(() => {
    const { type, pollingId, result, status } = executionState;
    if (status !== "polling" || !pollingId || !problemId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const snapshot = type === "test"
          ? fromTest(await getTestRunProgress(problemId, pollingId), pollingId, result?.total)
          : fromSubmission(await getSubmission(pollingId));
        if (!cancelled) apply(type, snapshot);
      } catch (error) { if (!cancelled) fail(error); }
    }, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [executionState, problemId, apply, fail]);

  return { executionState, execute };
}
