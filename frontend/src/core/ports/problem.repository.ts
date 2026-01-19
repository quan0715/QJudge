import type {
  Problem,
  ProblemDetail,
  ProblemUpsertPayload,
  Difficulty,
  Tag,
} from "@/core/entities/problem.entity";

// ============================================================================
// Query Parameters
// ============================================================================

export interface GetProblemsParams {
  scope?: string;
  search?: string;
  difficulty?: Difficulty[];
  tags?: string[];
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
  use_samples: boolean;
  custom_test_cases: { input: string }[];
}

export interface TestRunResultItem {
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

// ============================================================================
// Port Interface
// ============================================================================

export interface IProblemRepository {
  // Read operations
  getProblems(params?: GetProblemsParams | string): Promise<Problem[]>;
  getProblem(id: string, scope?: string): Promise<ProblemDetail | undefined>;
  getTags(): Promise<Tag[]>;
  getProblemStatistics(
    problemId: string,
    params?: { contest?: string; limit?: number }
  ): Promise<ProblemStatistics>;

  // Write operations
  createProblem(data: ProblemUpsertPayload): Promise<ProblemDetail>;
  updateProblem(id: string, data: ProblemUpsertPayload): Promise<ProblemDetail>;
  patchProblem(
    id: string,
    data: Partial<ProblemUpsertPayload>
  ): Promise<ProblemDetail>;
  deleteProblem(id: string): Promise<void>;

  // Test run
  testRun(problemId: string, payload: TestRunPayload): Promise<TestRunResult>;
}
