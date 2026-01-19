import { httpClient, requestJson } from "@/infrastructure/api/http.client";
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

// ============================================================================
// Submission Repository Implementation
// ============================================================================

export const submitSolution = async (
  data: SubmitSolutionPayload
): Promise<SubmissionDetail> => {
  const responseData = await requestJson<any>(
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
  const queryParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null)
        queryParams.append(key, String(value));
    });
  }

  const data = await requestJson<any>(
    httpClient.get(`/api/v1/submissions/?${queryParams.toString()}`),
    "Failed to fetch submissions"
  );
  const results = data.results || data;
  const count = data.count || (Array.isArray(data) ? data.length : 0);
  return {
    results: Array.isArray(results) ? results.map(mapSubmissionDto) : [],
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

  const data = await res.json();
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
