import type {
  Difficulty,
} from "@/core/entities/problem.entity";

// ============================================================================
// Query Parameters
// ============================================================================

export interface GetProblemsParams {
  scope?: string;
  search?: string;
  difficulty?: Difficulty[];
  tags?: string[];
  page?: number;
  page_size?: number;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface ProblemStatistics {
  submissionCount: number;
  acceptedCount: number;
  acRate: number;
  statusCounts: Record<string, number>;
  trend: Array<{ date: string; count: number }>;
}

// ============================================================================
// Test Run Types
// ============================================================================

export interface TestRunPayload {
  language: string;
  code: string;
  contest_id?: string;
}

interface TestRunResultItem {
  status: string;
  input: string;
  output: string;
  expected_output?: string;
  exec_time?: number;
  memory_usage?: number;
  error_message?: string;
}

export interface TestRunResult {
  status: string;
  results: TestRunResultItem[];
}
