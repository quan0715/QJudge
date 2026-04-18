import type {
  CodingProblem,
  CodingProblemDetail,
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
  page?: number;
  page_size?: number;
}

export interface PaginatedProblems {
  results: CodingProblem[];
  count: number;
  next: string | null;
  previous: string | null;
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
  getProblems(params?: GetProblemsParams | string): Promise<CodingProblem[]>;
  getProblem(id: string, scope?: string): Promise<CodingProblemDetail | undefined>;
  getTags(): Promise<Tag[]>;
  getProblemStatistics(
    problemId: string,
    params?: { contest?: string; limit?: number }
  ): Promise<ProblemStatistics>;

  // Write operations
  createProblem(data: ProblemUpsertPayload): Promise<CodingProblemDetail>;
  updateProblem(id: string, data: ProblemUpsertPayload): Promise<CodingProblemDetail>;
  patchProblem(
    id: string,
    data: Partial<ProblemUpsertPayload>
  ): Promise<CodingProblemDetail>;
  deleteProblem(id: string): Promise<void>;

  // Test run
  testRun(problemId: string, payload: TestRunPayload): Promise<TestRunResult>;
}
