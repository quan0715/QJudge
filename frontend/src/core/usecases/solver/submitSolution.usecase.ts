/**
 * Submit Solution Use Case
 *
 * Handles submitting a solution for formal judging.
 * Returns initial result - polling is handled separately by the caller.
 */

import {
  submitSolution,
  getSubmission,
} from "@/infrastructure/api/repositories/submission.repository";
import type { SubmissionDetail } from "@/core/entities/submission.entity";

// ============================================================================
// Types
// ============================================================================

export interface SubmitSolutionInput {
  problemId: string;
  language: string;
  code: string;
  contestId?: string;
}

export interface TestCaseResult {
  id: string;
  passed: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  error?: string;
  executionTime?: number;
  memoryUsage?: number;
  isHidden?: boolean;
}

export interface SubmissionResult {
  submissionId: string;
  status: string;
  score?: number;
  passed: number;
  total: number;
  cases: TestCaseResult[];
  isPending: boolean;
  error?: string;
}

export interface SubmitSolutionOutput {
  success: boolean;
  result?: SubmissionResult;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function transformSubmissionToResult(data: SubmissionDetail): SubmissionResult {
  const results = data.results || [];
  const totalTestCases = data.totalTestCases ?? results.length;

  const cases: TestCaseResult[] = results.map((r, idx) => ({
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

  const passed = cases.filter((c) => c.passed).length;
  const isPending = data.status === "pending" || data.status === "judging";

  return {
    submissionId: data.id,
    status: data.status,
    score: data.score,
    passed,
    total: totalTestCases,
    cases,
    isPending,
    error: data.errorMessage,
  };
}

// ============================================================================
// Use Case Implementation
// ============================================================================

export async function submitSolutionUseCase(
  input: SubmitSolutionInput
): Promise<SubmitSolutionOutput> {
  const { problemId, language, code, contestId } = input;

  try {
    const submission = await submitSolution({
      problem_id: problemId,
      language,
      code,
      contest_id: contestId,
    });

    return {
      success: true,
      result: transformSubmissionToResult(submission),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Submission failed",
    };
  }
}

/**
 * Poll for submission result
 * Call this repeatedly until isPending is false
 */
export async function pollSubmissionUseCase(
  submissionId: string
): Promise<SubmitSolutionOutput> {
  try {
    const submission = await getSubmission(submissionId);

    return {
      success: true,
      result: transformSubmissionToResult(submission),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to get submission result",
    };
  }
}

export default submitSolutionUseCase;
