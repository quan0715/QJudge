import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Problem,
  ProblemDetail,
  ProblemUpsertPayload,
  Tag,
} from "@/core/entities/problem.entity";
import type {
  IProblemRepository,
  GetProblemsParams,
  ProblemStatistics,
  TestRunPayload,
  TestRunResult,
} from "@/core/ports/problem.repository";
import {
  mapProblemDto,
  mapProblemDetailDto,
  mapTagDto,
} from "@/infrastructure/mappers/problem.mapper";

// ============================================================================
// Problem Repository Implementation
// ============================================================================

export const getProblems = async (
  params?: GetProblemsParams | string
): Promise<Problem[]> => {
  let query = "";

  if (typeof params === "string") {
    query = params ? `?scope=${params}` : "";
  } else if (params) {
    const searchParams = new URLSearchParams();
    if (params.scope) searchParams.append("scope", params.scope);
    if (params.search) searchParams.append("search", params.search);
    if (params.difficulty && params.difficulty.length > 0) {
      params.difficulty.forEach((d) => searchParams.append("difficulty", d));
    }
    if (params.tags && params.tags.length > 0) {
      searchParams.append("tags", params.tags.join(","));
    }
    const queryString = searchParams.toString();
    query = queryString ? `?${queryString}` : "";
  }

  const data = await requestJson<any>(
    httpClient.get(`/api/v1/problems/${query}`),
    "Failed to fetch problems"
  );
  const results = data.results || data;
  return Array.isArray(results) ? results.map(mapProblemDto) : [];
};

export const getProblem = async (
  id: string,
  scope?: string
): Promise<ProblemDetail | undefined> => {
  const query = scope ? `?scope=${scope}` : "";
  const res = await httpClient.get(`/api/v1/problems/${id}/${query}`);

  if (!res.ok) {
    return undefined;
  }

  const data = await res.json();
  return mapProblemDetailDto(data);
};

export const createProblem = async (
  data: ProblemUpsertPayload
): Promise<ProblemDetail> => {
  const responseData = await requestJson<any>(
    httpClient.post("/api/v1/problems/", data),
    "Failed to create problem"
  );
  return mapProblemDetailDto(responseData);
};

export const updateProblem = async (
  id: string,
  data: ProblemUpsertPayload
): Promise<ProblemDetail> => {
  const responseData = await requestJson<any>(
    httpClient.put(`/api/v1/problems/${id}/?scope=manage`, data),
    "Failed to update problem"
  );
  return mapProblemDetailDto(responseData);
};

export const patchProblem = async (
  id: string,
  data: Partial<ProblemUpsertPayload>
): Promise<ProblemDetail> => {
  const responseData = await requestJson<any>(
    httpClient.patch(`/api/v1/problems/${id}/?scope=manage`, data),
    "Failed to patch problem"
  );
  return mapProblemDetailDto(responseData);
};

export const deleteProblem = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/problems/${id}/`),
    "Failed to delete problem"
  );
};

export const getTags = async (): Promise<Tag[]> => {
  try {
    const data = await requestJson<any>(
      httpClient.get("/api/v1/problems/tags/"),
      "Failed to fetch tags"
    );
    const tags = Array.isArray(data) ? data : data.results || data.tags || [];
    return tags.map(mapTagDto);
  } catch {
    console.warn("Failed to fetch tags");
    return [];
  }
};

export const getProblemStatistics = async (
  problemId: string,
  params?: { contest?: string; limit?: number }
): Promise<ProblemStatistics> => {
  const queryParams = new URLSearchParams();
  if (params?.contest) queryParams.append("contest", params.contest);
  if (params?.limit) queryParams.append("limit", params.limit.toString());

  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/problems/${problemId}/statistics/${query}`),
    "Failed to fetch problem statistics"
  );
  return {
    submissionCount: data.submission_count || 0,
    acceptedCount: data.accepted_count || 0,
    acRate: data.ac_rate || 0,
    statusCounts: data.status_counts || {},
    trend: Array.isArray(data.trend) ? data.trend : [],
  };
};

export const testRun = async (
  problemId: string,
  payload: TestRunPayload
): Promise<TestRunResult> => {
  return requestJson<TestRunResult>(
    httpClient.post(`/api/v1/problems/${problemId}/test_run/`, payload),
    "Test run failed"
  );
};

// ============================================================================
// Repository Instance (implements IProblemRepository)
// ============================================================================

export const problemRepository: IProblemRepository = {
  getProblems,
  getProblem,
  createProblem,
  updateProblem,
  patchProblem,
  deleteProblem,
  getTags,
  getProblemStatistics,
  testRun,
};

export default problemRepository;
