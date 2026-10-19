import { createContext } from "react";
import type { TestRunCustomCase } from "@/core/ports/problem.repository";
import type { ExecutionState, ExecutionType } from "@/core/types/solver.types";

/** Delay before each poll; the last value repeats until nothing is running. */
export const JUDGE_POLL_DELAYS_MS = [500, 1000, 2000] as const;

/** One test run or submission started on this client. */
export interface JudgeRun extends ExecutionState {
  key: string;
  /** CodingProblem.id */
  problemId: string;
  contestId: string;
  startedAt: number;
  /** Submission id or test run_id, once the start request returns. */
  remoteId?: string;
  /** Server createdAt of a submission, used as the list's created_after. */
  createdAt?: string;
}

export type JudgeProblemStatus = "judging" | "accepted" | "rejected";

export interface JudgeStartPayload {
  problemId: string;
  contestId: string;
  language: string;
  code: string;
  customTestCases: TestRunCustomCase[];
}

export interface JudgedEvent {
  run: JudgeRun;
  /** The student is on that problem and its panel shows this run. */
  onScreen: boolean;
  /** Make this run the one the problem's panel shows. */
  show: () => void;
}

/** The run a problem's result panel shows; `showing` changes every time a run is shown, even the same one again. */
export interface DisplayedRun {
  key: string;
  showing: number;
}

export interface JudgeQueueValue {
  runs: JudgeRun[];
  /** problemId -> the run its result panel shows */
  displayed: Record<string, DisplayedRun>;
  start: (type: ExecutionType, payload: JudgeStartPayload) => Promise<void>;
  show: (problemId: string, key: string) => void;
  /** The problem whose result panel is showing its run, or null. */
  setViewing: (problemId: string | null) => void;
}

export const JudgeQueueContext = createContext<JudgeQueueValue | null>(null);

export const isRunActive = (run: JudgeRun) => run.status === "running" || run.status === "polling";

export function summarizeProblemStatuses(runs: JudgeRun[]): Record<string, JudgeProblemStatus> {
  const statuses: Record<string, JudgeProblemStatus> = {};
  for (const run of runs) {
    if (run.type !== "submit" || run.status === "error" || run.status === "idle") continue;
    const current = statuses[run.problemId];
    if (isRunActive(run)) statuses[run.problemId] = "judging";
    else if (current === "judging") continue;
    else if (run.result?.type === "submit" && run.result.status === "AC") statuses[run.problemId] = "accepted";
    else if (!current) statuses[run.problemId] = "rejected";
  }
  return statuses;
}
