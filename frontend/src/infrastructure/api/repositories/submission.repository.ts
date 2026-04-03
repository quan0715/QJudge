import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import { buildQuery } from "@/infrastructure/api/utils/buildQuery.client";
import type { SubmissionDetail } from "@/core/entities/submission.entity";
import type {
  ISubmissionRepository,
  GetSubmissionsParams,
  GetSubmissionsResult,
  SubmitSolutionPayload,
} from "@/core/ports/submission.repository";
import {
  mapSubmissionDto,
  mapSubmissionDetailDto,
} from "@/infrastructure/mappers/submission.mapper";
import type { SubmissionDto, SubmissionDetailDto } from "@/infrastructure/api/dto/submission.dto";

// ============================================================================
// Submission Repository Implementation
// ============================================================================

export const submitSolution = async (
  data: SubmitSolutionPayload
): Promise<SubmissionDetail> => {
  const responseData = await requestJson<SubmissionDetailDto>(
    httpClient.post(`/api/v1/submissions/`, {
      problem: data.problem_id,
      language: data.language,
      code: data.code,
      contest: data.contest_id,
    }),
    "Submission failed"
  );
  return mapSubmissionDetailDto(responseData);
};

export const getSubmissions = async (
  params?: GetSubmissionsParams
): Promise<GetSubmissionsResult> => {
  const query = buildQuery(params as Record<string, unknown>);

  const data = await requestJson<{ results?: SubmissionDto[]; count?: number } | SubmissionDto[]>(
    httpClient.get(`/api/v1/submissions/${query}`),
    "Failed to fetch submissions"
  );
  
  const results = Array.isArray(data) ? data : data.results || [];
  const count = !Array.isArray(data) && data.count != null ? data.count : results.length;

  return {
    results: results.map(mapSubmissionDto),
    count,
  };
};

export const getSubmission = async (id: string): Promise<SubmissionDetail> => {
  const res = await httpClient.get(`/api/v1/submissions/${id}/`);

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("Permission denied");
    }
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.detail || "Failed to fetch submission");
  }

  const data = await res.json() as SubmissionDetailDto;
  return mapSubmissionDetailDto(data);
};

// ============================================================================
// Repository Instance (implements ISubmissionRepository)
// ============================================================================

export const submissionRepository: ISubmissionRepository = {
  getSubmissions,
  getSubmission,
  submitSolution,
};

export default submissionRepository;
