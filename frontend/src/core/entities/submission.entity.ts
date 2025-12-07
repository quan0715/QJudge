import type { Problem } from './problem.entity';
import type { User } from './user.entity';

export type SubmissionStatus = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'NS' | 'pending' | 'judging' | 'SE';

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
  isTest?: boolean;
}

export interface SubmissionDetail extends Submission {
  code: string;
  errorMessage?: string;
  user?: User; // Expanded user info
  problem?: Problem; // Expanded problem info
  results?: TestResult[];
  customTestCases?: {
    input: string;
    output: string;
  }[];
}
