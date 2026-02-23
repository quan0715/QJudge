import type { SubmissionResult, TestRunResult } from "@/core/types/solver.types";

export const transformTestRunToResult = (data: any): TestRunResult => {
  const results = data.results || [];
  const cases = results.map((r: any, idx: number) => ({
    id: r.id?.toString() || `case_${idx}`,
    passed: r.status === "AC",
    input: r.input,
    expectedOutput: r.expected_output,
    actualOutput: r.output,
    error: r.error_message,
    executionTime: r.exec_time,
    memoryUsage: r.memory_usage,
    isHidden: false,
    status: r.status,
  }));

  const passed = cases.filter((r: any) => r.status === "AC").length;
  const infoCount = cases.filter((r: any) => r.status === "info").length;
  const failed = results.length - passed - infoCount;

  return {
    type: "run",
    passed,
    failed,
    total: results.length,
    cases,
    error: data.error_message,
  };
};

export const transformSubmissionToResult = (data: any): SubmissionResult => {
  const results = data.results || [];
  const totalTestCases = data.totalTestCases ?? results.length;
  const cases = results.map((r: any, idx: number) => ({
    id: r.id?.toString() || `case_${idx}`,
    passed: r.status === "AC",
    input: r.input,
    expectedOutput: r.expectedOutput,
    actualOutput: r.output,
    error: r.errorMessage,
    executionTime: r.execTime,
    memoryUsage: r.memoryUsage,
    isHidden: r.isHidden,
  }));
  const passed = cases.filter((r: any) => r.passed).length;

  let uiStatus = data.status;
  const isPending = data.status === "pending" || data.status === "judging";

  if (!isPending) {
    if (["AC", "WA", "TLE", "MLE", "RE", "CE", "KR", "SE"].includes(data.status)) {
      uiStatus = data.status;
    } else {
      uiStatus = "RE";
    }
  } else {
    uiStatus = "Pending";
  }

  return {
    type: "submit",
    status: uiStatus,
    passed,
    total: totalTestCases,
    score: data.score,
    error: data.errorMessage,
    submissionId: data.id,
    cases,
  };
};
