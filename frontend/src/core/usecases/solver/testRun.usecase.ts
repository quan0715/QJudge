/**
 * Test Run Use Case
 *
 * Handles executing test runs against sample and custom test cases.
 * Test runs are synchronous - no polling needed.
 */

import { testRun } from "@/infrastructure/api/repositories/problem.repository";
import type { TestRunResult as ApiTestRunResult } from "@/core/ports/problem.repository";

// ============================================================================
// Types
// ============================================================================

export interface TestRunInput {
  problemId: string;
  language: string;
  code: string;
  customTestCases: { input: string }[];
  useSamples?: boolean;
}

export interface TestCaseResult {
  id: string;
  passed: boolean;
  status: string;
  input: string;
  expectedOutput?: string;
  actualOutput?: string;
  error?: string;
  executionTime?: number;
  memoryUsage?: number;
}

export interface TestRunOutput {
  success: boolean;
  passed: number;
  failed: number;
  total: number;
  cases: TestCaseResult[];
  error?: string;
}

// ============================================================================
// Use Case Implementation
// ============================================================================

function transformApiResult(result: ApiTestRunResult): TestRunOutput {
  const results = result.results || [];

  const cases: TestCaseResult[] = results.map((r, idx) => ({
    id: `case_${idx}`,
    // 'AC' means passed, 'info' is neutral (custom case executed), others are failed
    passed: r.status === "AC",
    status: r.status,
    input: r.input,
    expectedOutput: r.expected_output,
    actualOutput: r.output,
    error: r.error_message,
    executionTime: r.exec_time,
    memoryUsage: r.memory_usage,
  }));

  // Count results: AC = passed, 'info' = neutral, others = failed
  const passed = cases.filter((c) => c.status === "AC").length;
  const infoCount = cases.filter((c) => c.status === "info").length;
  const failed = results.length - passed - infoCount;

  return {
    success: true,
    passed,
    failed,
    total: results.length,
    cases,
  };
}

export async function testRunUseCase(
  input: TestRunInput
): Promise<TestRunOutput> {
  const { problemId, language, code, customTestCases, useSamples = true } = input;

  try {
    const result = await testRun(problemId, {
      language,
      code,
      use_samples: useSamples,
      custom_test_cases: customTestCases,
    });

    return transformApiResult(result);
  } catch (error: any) {
    return {
      success: false,
      passed: 0,
      failed: 0,
      total: 0,
      cases: [],
      error: error?.message || "Test run failed",
    };
  }
}

export default testRunUseCase;
