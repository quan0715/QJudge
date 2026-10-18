import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSubmission, getSubmissions, submitSolution } from "@/infrastructure/api/repositories/submission.repository";
import { getTestRunProgress, testRun } from "@/infrastructure/api/repositories/problem.repository";
import type { SubmissionDetail } from "@/core/entities/submission.entity";
import type { TestRunResult } from "@/core/ports/problem.repository";
import type { ExecutionType } from "@/core/types/solver.types";
import { transformSubmissionToResult, transformTestRunToResult } from "@/features/problems/hooks/solverAdapters";
import {
  JUDGE_POLL_DELAYS_MS,
  JudgeQueueContext,
  isRunActive,
  type JudgedEvent,
  type JudgeRun,
  type JudgeStartPayload,
} from "./judgeQueueStore";

type RunUpdate = Partial<JudgeRun>;
const LAST_STEP = JUDGE_POLL_DELAYS_MS.length - 1;

const fromTest = (data: TestRunResult, runId?: string, total?: number): RunUpdate => {
  const complete = data.execution_status === "complete";
  const remoteId = data.run_id ?? runId;
  return {
    remoteId,
    result: transformTestRunToResult({ ...data, total: complete ? undefined : data.total ?? total }),
    status: !complete && remoteId ? "polling" : "complete",
  };
};
const fromSubmission = (data: SubmissionDetail): RunUpdate => ({
  remoteId: data.id,
  createdAt: data.createdAt,
  result: transformSubmissionToResult(data),
  status: data.status === "pending" || data.status === "judging" ? "polling" : "complete",
  queued: data.status === "pending",
});
// test_run_status reports a failed run as 500 and an expired one as 404; anything else is retried.
const isFinishedTestRun = (error: unknown) => [404, 500].includes((error as { status?: number }).status ?? 0);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "執行失敗");
const earliest = (values: Array<string | undefined>) =>
  values.filter((value): value is string => !!value).sort((a, b) => Date.parse(a) - Date.parse(b))[0];

/**
 * Tracks every test run and submission started during an exam, keyed by
 * CodingProblem.id, so judging continues while the student works elsewhere.
 * One schedule polls everything still running.
 */
export function JudgeQueueProvider({ userId, onJudged, children }: {
  userId: string;
  onJudged?: (event: JudgedEvent) => void;
  children: ReactNode;
}) {
  const [runs, setRuns] = useState<JudgeRun[]>([]);
  const [displayed, setDisplayed] = useState<Record<string, string>>({});
  const [poll, setPoll] = useState({ step: 0, generation: 0 });
  const runsRef = useRef<JudgeRun[]>([]);
  const displayedRef = useRef<Record<string, string>>({});
  const viewingRef = useRef<string | null>(null);
  const fetchingRef = useRef(new Set<string>());
  const counterRef = useRef(0);
  const aliveRef = useRef(true);
  const onJudgedRef = useRef(onJudged);

  useEffect(() => { onJudgedRef.current = onJudged; }, [onJudged]);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const show = useCallback((problemId: string, key: string) => {
    displayedRef.current = { ...displayedRef.current, [problemId]: key };
    setDisplayed(displayedRef.current);
  }, []);
  const setViewing = useCallback((problemId: string | null) => { viewingRef.current = problemId; }, []);

  const settle = useCallback((key: string, update: RunUpdate) => {
    const current = runsRef.current.find((run) => run.key === key);
    if (!aliveRef.current || !current || !isRunActive(current)) return;
    const next = { ...current, ...update };
    runsRef.current = runsRef.current.map((run) => (run.key === key ? next : run));
    setRuns(runsRef.current);
    if (next.type === "submit" && next.status === "complete") {
      onJudgedRef.current?.({
        run: next,
        onScreen: viewingRef.current === next.problemId && displayedRef.current[next.problemId] === next.key,
        show: () => show(next.problemId, next.key),
      });
    }
  }, [show]);

  const start = useCallback(async (type: ExecutionType, payload: JudgeStartPayload) => {
    const { problemId, contestId, language, code, customTestCases } = payload;
    const busy = runsRef.current.some((run) => run.problemId === problemId && run.type === type &&
      (type === "test" ? isRunActive(run) : run.status === "running"));
    if (busy) return;
    const key = `${type}-${++counterRef.current}`;
    runsRef.current = [...runsRef.current, { key, type, problemId, contestId, startedAt: Date.now(), status: "running", result: null }];
    setRuns(runsRef.current);
    show(problemId, key);
    setPoll((previous) => ({ step: 0, generation: previous.generation + 1 }));
    try {
      const request = { language, code, contest_id: contestId };
      settle(key, type === "test"
        ? fromTest(await testRun(problemId, { ...request, asynchronous: true, custom_test_cases: customTestCases }))
        : fromSubmission(await submitSolution({ ...request, problem_id: problemId })));
    } catch (error) {
      settle(key, { status: "error", error: errorMessage(error) });
    }
  }, [settle, show]);

  const tick = useCallback(async (generation: number) => {
    const polling = runsRef.current.filter((run) => run.status === "polling" && run.remoteId);
    const submissions = polling.filter((run) => run.type === "submit");
    const contestIds = [...new Set(submissions.map((run) => run.contestId))];
    let failed = false;

    const fetchDetail = async (run: JudgeRun) => {
      if (fetchingRef.current.has(run.key)) return;
      fetchingRef.current.add(run.key);
      try { settle(run.key, fromSubmission(await getSubmission(run.remoteId!))); }
      catch { failed = true; }
      finally { fetchingRef.current.delete(run.key); }
    };

    await Promise.all([
      ...contestIds.map(async (contestId) => {
        const tracked = submissions.filter((run) => run.contestId === contestId);
        try {
          const { results } = await getSubmissions({
            contest: contestId,
            user: userId,
            created_after: earliest(tracked.map((run) => run.createdAt)),
            page_size: 100,
          });
          await Promise.all(tracked.map(async (run) => {
            const row = results.find((item) => item.id === run.remoteId);
            if (!row) return;
            if (row.status === "pending" || row.status === "judging") settle(run.key, { queued: row.status === "pending" });
            else await fetchDetail(run);
          }));
        } catch { failed = true; }
      }),
      ...polling.filter((run) => run.type === "test").map(async (run) => {
        try { settle(run.key, fromTest(await getTestRunProgress(run.problemId, run.remoteId!), run.remoteId, run.result?.total)); }
        catch (error) {
          if (isFinishedTestRun(error)) settle(run.key, { status: "error", error: errorMessage(error) });
          else failed = true;
        }
      }),
    ]);
    if (!aliveRef.current) return;
    setPoll((previous) => previous.generation === generation
      ? { ...previous, step: failed ? LAST_STEP : previous.step + 1 }
      : previous);
  }, [settle, userId]);

  const hasPolling = runs.some((run) => run.status === "polling");
  useEffect(() => {
    if (!hasPolling) return;
    const timer = setTimeout(() => { void tick(poll.generation); }, JUDGE_POLL_DELAYS_MS[Math.min(poll.step, LAST_STEP)]);
    return () => clearTimeout(timer);
  }, [hasPolling, poll, tick]);

  const value = useMemo(
    () => ({ runs, displayed, start, show, setViewing }),
    [runs, displayed, start, show, setViewing],
  );
  return <JudgeQueueContext.Provider value={value}>{children}</JudgeQueueContext.Provider>;
}

export default JudgeQueueProvider;
