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
// Test Run Types
// ============================================================================

export interface TestRunCustomCase {
  input: string;
  /** Blank means "just show the output"; the case is not judged. */
  expected_output?: string;
}

export interface TestRunPayload {
  language: string;
  code: string;
  contest_id?: string;
  asynchronous?: boolean;
  /** Run after the public samples, in this order. */
  custom_test_cases?: TestRunCustomCase[];
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
  run_id?: string;
  execution_status?: "pending" | "judging" | "complete";
  total?: number;
  status: string;
  results: TestRunResultItem[];
}
