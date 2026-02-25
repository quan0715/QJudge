import type { Problem } from './problem.entity';
import type { User } from './user.entity';

/**
 * Status types for submissions and test results.
 * - 'info': Used by test-run for custom test cases (no expected output to compare)
 */
export type SubmissionStatus = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'KR' | 'NS' | 'pending' | 'judging' | 'SE' | 'passed' | 'failed' | 'info';

// TestCase result status (alias for common use)
export type TestCaseStatus = 'passed' | 'failed' | 'pending' | 'info';

export interface TestResult {
  id: string | number;
  testCaseId: string | number;
  status: SubmissionStatus;
  execTime: number; // ms
  memoryUsage: number; // KB
  isHidden: boolean;
  errorMessage?: string;
  input?: string;
  output?: string;
  expectedOutput?: string;
}

export interface Submission {
  id: string;
  problemId: string;
  problemTitle?: string; // Added for list view display
  userId: string;
  username?: string; // Added for list view display
  language: string;
  status: SubmissionStatus;
  score?: number;
  execTime?: number;
  memoryUsage?: number;
  createdAt: string;
  
  // Optional context
  contestId?: string;
}

export interface SubmissionDetail extends Submission {
  code: string;
  errorMessage?: string;
  user?: User; // Expanded user info
  problem?: Problem; // Expanded problem info
  results?: TestResult[];
  totalTestCases?: number;
}
