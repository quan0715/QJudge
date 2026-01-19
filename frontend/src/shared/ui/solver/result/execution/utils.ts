import type { TestCaseItem } from "@/core/entities/testcase.entity";
import type { ExecutionState } from "@/core/types/solver.types";
import type { SubmissionStatus } from "@/core/entities/submission.entity";

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

export const getHeaderInfo = (
    isPending: boolean,
    globalError: string | null | undefined,
    result: ExecutionState["result"]
): HeaderInfo => {
     if (isPending) {
         return { title: "Executing...", type: "blue", subtitle: "Running tests..." };
     }
     if (globalError) {
         return { title: "Error", type: "red", subtitle: globalError };
     }
     
     if (result?.type === 'submit') {
         const isAC = result.status === 'AC';
         const statusText = result.status === 'AC' ? "Accepted" : 
                            result.status === 'WA' ? "Wrong Answer" : 
                            result.status || "Failed";
         return {
             title: statusText,
             type: isAC ? "green" : "red",
             subtitle: `Score: ${result.score || 0}`
         };
     }

     if (result?.type === 'run') {
         const allPassed = result.failed === 0;
         return {
             title: allPassed ? "Accepted" : "Wrong Answer",
             type: allPassed ? "green" : "red",
             subtitle: `${result.passed} / ${result.total} Passed`
         };
     }

     return { title: "Ready", type: "gray", subtitle: "-" };
};
