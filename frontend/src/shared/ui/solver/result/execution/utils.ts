import type { TestCaseItem } from "@/core/entities/testcase.entity";
import type { ExecutionState } from "@/core/types/solver.types";
import type { SubmissionStatus } from "@/core/entities/submission.entity";
import { translateVerdict } from "@/core/config/status.config";

export interface CaseResultDisplay {
  id: string;
  /** UI display status for list items */
  status: "pending" | "passed" | "failed";
  /** Original API status for detailed view (e.g., 'WA', 'TLE', 'AC', 'info') */
  originalStatus?: SubmissionStatus;
  label: string;
  isHidden?: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  error?: string;
  executionTime?: number;
  memoryUsage?: number;
}

export interface HeaderInfo {
    title: string;
    type: "green" | "red" | "blue" | "gray";
    subtitle: string;
}

/**
 * Map API status to original status for detail display
 */
const mapOriginalStatus = (c: any): SubmissionStatus => {
  // If status is explicitly provided, use it
  if (c.status) {
    return c.status as SubmissionStatus;
  }
  // Fallback based on passed flag
  return c.passed ? "AC" : "WA";
};

/**
 * Map API status to UI display status
 */
const mapDisplayStatus = (c: any): "pending" | "passed" | "failed" => {
  if (c.status === "pending" || c.status === "judging") return "pending";
  if (c.status === "AC" || c.passed) return "passed";
  // 'info' status (custom test case with no expected output) is treated as passed for UI
  if (c.status === "info") return "passed";
  return "failed";
};

export const buildCaseResults = (
  isPending: boolean,
  type: ExecutionState["type"],
  result: ExecutionState["result"],
  testCases: TestCaseItem[]
): CaseResultDisplay[] => {
  const buildCaseItem = (c: any, idx: number): CaseResultDisplay => ({
    id: c.id,
    status: mapDisplayStatus(c),
    originalStatus: mapOriginalStatus(c),
    label: `Test Case ${idx}`,
    isHidden: c.isHidden,
    input: c.input,
    expectedOutput: c.expectedOutput,
    actualOutput: c.actualOutput,
    error: c.error,
    executionTime: c.executionTime,
    memoryUsage: c.memoryUsage,
  });

  // 1. Pending State
  if (isPending) {
    if (type === 'test' && result && result.type === 'run') {
      const total = result.total || testCases.length;
      const cases = result.cases || [];
      if (total > 0) {
        return Array.from({ length: total }).map((_, idx) => {
          const caseResult = cases[idx];
          const testCase = testCases[idx];
          const label = testCase
            ? (testCase.isSample || testCase.source === "public"
                ? `Sample Case ${idx}`
                : `Custom Case ${idx}`)
            : `Test Case ${idx}`;
          if (caseResult) {
            return {
              ...buildCaseItem(caseResult, idx),
              label,
            };
          }
          return {
            id: testCase?.id || `test_case_${idx}`,
            status: "pending" as const,
            originalStatus: "pending" as SubmissionStatus,
            label,
            isHidden: testCase?.isHidden,
            input: testCase?.input,
            expectedOutput: testCase?.output,
          };
        });
      }
    }
    if (type === 'submit' && result && result.type === 'submit') {
      const total = result.total || 0;
      const cases = result.cases || [];
      if (total > 0) {
        return Array.from({ length: total }).map((_, idx) => {
          const caseResult = cases[idx];
          if (caseResult) {
            return buildCaseItem(caseResult, idx);
          }
          return {
            id: `submit_case_${idx}`,
            status: "pending" as const,
            originalStatus: "pending" as SubmissionStatus,
            label: `Test Case ${idx}`,
          };
        });
      }
    }
    return testCases.map((tc, idx) => ({
      id: tc.id,
      status: "pending" as const,
      originalStatus: "pending" as SubmissionStatus,
      label: tc.isSample || tc.source === "public" ? `Sample Case ${idx}` : `Custom Case ${idx}`,
      isHidden: tc.isHidden,
      input: tc.input,
      expectedOutput: tc.output,
    }));
  }

  // 2. Complete State - Test Run
  if (type === 'test' && result && result.type === 'run') {
     return (result.cases || []).map((c, idx) => ({
        id: c.id,
        status: mapDisplayStatus(c),
        originalStatus: mapOriginalStatus(c),
        label: `Test Case ${idx}`,
        isHidden: c.isHidden, 
        input: c.input,
        expectedOutput: c.expectedOutput,
        actualOutput: c.actualOutput,
        error: c.error,
        executionTime: c.executionTime,
        memoryUsage: c.memoryUsage
     }));
  }

  // 3. Complete State - Submission
  if (type === 'submit' && result && result.type === 'submit') {
     if (result.cases && result.cases.length > 0) {
        return result.cases.map((c, idx) => buildCaseItem(c, idx));
     }
     const total = result.total || 0;
     const passed = result.passed || 0;
     
     return Array.from({ length: total }).map((_, idx) => {
         const isPassed = idx < passed;
         return {
             id: `submit_case_${idx}`,
             status: isPassed ? ("passed" as const) : ("failed" as const),
             originalStatus: (isPassed ? "AC" : "WA") as SubmissionStatus,
             label: `Test Case ${idx}`,
             input: undefined,
             expectedOutput: undefined,
             actualOutput: undefined
         };
     });
  }

  return [];
};

type Translate = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

/** A test run has no single verdict: all passed, or the first failing case's verdict. */
const runVerdict = (cases: Array<{ status?: string; passed?: boolean }>, failed: number): string => {
  if (failed === 0) return "AC";
  const failing = cases.find((c) => !c.passed && c.status && !["AC", "info", "passed"].includes(c.status));
  return failing?.status && failing.status !== "failed" ? failing.status : "WA";
};

export const getHeaderInfo = (
  { status, type, queued, error: globalError, result }: ExecutionState,
  t: Translate,
): HeaderInfo => {
  if (status === "running" || status === "polling") {
    const title = queued
      ? t("solver.queued", "排隊中")
      : type === "submit" ? t("solver.judging", "判題中") : t("solver.running", "執行中");
    return { title, type: "blue", subtitle: "" };
  }
  if (globalError) {
    return { title: t("solver.error", "發生錯誤"), type: "red", subtitle: globalError };
  }
  const passed = (p: number, total: number) => t("solver.passedCount", `通過 ${p} / ${total}`, { passed: p, total });

  if (result?.type === "submit") {
    const verdict = result.status || "SE";
    return {
      title: translateVerdict(t, verdict),
      type: verdict === "AC" ? "green" : "red",
      subtitle: `${passed(result.passed, result.total)} · ${t("solver.score", `得分 ${result.score || 0}`, { score: result.score || 0 })}`,
    };
  }

  if (result?.type === "run") {
    const verdict = runVerdict(result.cases || [], result.failed);
    return {
      title: translateVerdict(t, verdict),
      type: verdict === "AC" ? "green" : "red",
      subtitle: passed(result.passed, result.total),
    };
  }

  return { title: "", type: "gray", subtitle: "" };
};
