/**
 * Solver-related shared types
 * 
 * These types are shared across problem solver and contest solver components.
 * Centralizing them here avoids duplicate definitions and ensures consistency.
 */

// ============================================================================
// Result Mode
// ============================================================================

/**
 * Mode for the result panel
 * - testcases: Edit and manage test cases
 * - results: View execution results
 */
export type ResultMode = "testcases" | "results";

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Status of code execution
 */
export type ExecutionStatus = 'idle' | 'running' | 'polling' | 'complete' | 'error';

/**
 * Type of execution
 */
export type ExecutionType = 'test' | 'submit';

/**
 * Individual test case result from execution
 */
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
  /** Original status from API (e.g., 'AC', 'WA', 'TLE', 'info') */
  status?: string;
}

/**
 * Result of a test run (local testing)
 */
export interface TestRunResult {
  type: "run";
  passed: number;
  failed: number;
  total: number;
  cases: TestCaseResult[];
  error?: string;
}

/**
 * Result of a formal submission
 */
export interface SubmissionResult {
  type: "submit";
  status: string;
  passed: number;
  total: number;
  score?: number;
  error?: string;
  submissionId?: string;
  cases?: TestCaseResult[];
}

/**
 * Unified execution state for both test runs and submissions
 */
export interface ExecutionState {
  type: ExecutionType;
  status: ExecutionStatus;
  result: TestRunResult | SubmissionResult | null;
  error?: string;
  pollingId?: string;
}

/**
 * Initial/default execution state
 */
export const INITIAL_EXECUTION_STATE: ExecutionState = {
  type: 'test',
  status: 'idle',
  result: null,
};
