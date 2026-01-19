import type {
  Submission,
  SubmissionDetail,
} from "@/core/entities/submission.entity";

// ============================================================================
// Query Parameters
// ============================================================================

export interface GetSubmissionsParams {
  problem?: string;
  contest?: string;
  user?: string;
  status?: string;
  language?: string;
  page?: number;
  page_size?: number;
  [key: string]: string | number | undefined;
}

export interface GetSubmissionsResult {
  results: Submission[];
  count: number;
}

// ============================================================================
// Payload Types
// ============================================================================

export interface SubmitSolutionPayload {
  problem_id: string;
  language: string;
  code: string;
  contest_id?: string;
}

// ============================================================================
// Port Interface
// ============================================================================

export interface ISubmissionRepository {
  // Read operations
  getSubmissions(params?: GetSubmissionsParams): Promise<GetSubmissionsResult>;
  getSubmission(id: string): Promise<SubmissionDetail>;

  // Write operations
  submitSolution(data: SubmitSolutionPayload): Promise<SubmissionDetail>;
}
