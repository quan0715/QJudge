import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import { buildQuery } from "@/infrastructure/api/utils/buildQuery.client";
import type {
  CodingProblem,
  CodingProblemDetail,
  ProblemUpsertPayload,
  Tag,
} from "@/core/entities/problem.entity";
import type {
  IProblemRepository,
  GetProblemsParams,
  PaginatedProblems,
  ProblemStatistics,
  TestRunPayload,
  TestRunResult,
} from "@/core/ports/problem.repository";
import {
  mapProblemDto,
  mapProblemDetailDto,
  mapTagDto,
} from "@/infrastructure/mappers/problem.mapper";
import type { ProblemDto, ProblemDetailDto, TagDto } from "@/infrastructure/api/dto/problem.dto";

const MANAGEMENT_PROBLEMS_BASE = "/api/v1/management/problems";

// ============================================================================
// Problem Repository Implementation
// ============================================================================

export const getProblems = async (
  params?: GetProblemsParams | string
): Promise<CodingProblem[]> => {
  let query = "";
  const defaultScope = "manage";

  if (typeof params === "string") {
    const scope = params || defaultScope;
    query = `?scope=${scope}`;
  } else if (params) {
    query = buildQuery({
      scope: params.scope || defaultScope,
      search: params.search,
      difficulty: params.difficulty,
      tags: params.tags?.length ? params.tags.join(",") : undefined,
    });
  } else {
    query = `?scope=${defaultScope}`;
  }

  const data = await requestJson<{ results?: ProblemDto[] } | ProblemDto[]>(
    httpClient.get(`${MANAGEMENT_PROBLEMS_BASE}/${query}`),
    "Failed to fetch problems"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapProblemDto);
};

export const getPaginatedProblems = async (
  params?: GetProblemsParams
): Promise<PaginatedProblems> => {
  const query = params
    ? buildQuery({
        scope: params.scope || "manage",
        search: params.search,
        difficulty: params.difficulty,
        tags: params.tags?.length ? params.tags.join(",") : undefined,
        page: params.page,
        page_size: params.page_size,
      })
    : "?scope=manage";

  const data = await requestJson<{
    results?: ProblemDto[];
    count?: number;
    next?: string | null;
    previous?: string | null;
  }>(
    httpClient.get(`${MANAGEMENT_PROBLEMS_BASE}/${query}`),
    "Failed to fetch problems"
  );

  return {
    results: Array.isArray(data.results) ? data.results.map(mapProblemDto) : [],
    count: data.count || 0,
    next: data.next || null,
    previous: data.previous || null,
  };
};

export const getProblem = async (
  id: string,
  scope?: string
): Promise<CodingProblemDetail | undefined> => {
  const query = `?scope=${scope || "manage"}`;
  const res = await httpClient.get(`${MANAGEMENT_PROBLEMS_BASE}/${id}/${query}`);

  if (!res.ok) {
    return undefined;
  }

  const data = await res.json() as ProblemDetailDto;
  return mapProblemDetailDto(data);
};

export const createProblem = async (
  data: ProblemUpsertPayload
): Promise<CodingProblemDetail> => {
  const responseData = await requestJson<ProblemDetailDto>(
    httpClient.post(`${MANAGEMENT_PROBLEMS_BASE}/`, data),
    "Failed to create problem"
  );
  return mapProblemDetailDto(responseData);
};

export const updateProblem = async (
  id: string,
  data: ProblemUpsertPayload
): Promise<CodingProblemDetail> => {
  const responseData = await requestJson<ProblemDetailDto>(
    httpClient.put(`${MANAGEMENT_PROBLEMS_BASE}/${id}/?scope=manage`, data),
    "Failed to update problem"
  );
  return mapProblemDetailDto(responseData);
};

export const patchProblem = async (
  id: string,
  data: Partial<ProblemUpsertPayload>
): Promise<CodingProblemDetail> => {
  const responseData = await requestJson<ProblemDetailDto>(
    httpClient.patch(`${MANAGEMENT_PROBLEMS_BASE}/${id}/?scope=manage`, data),
    "Failed to patch problem"
  );
  return mapProblemDetailDto(responseData);
};

export const deleteProblem = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`${MANAGEMENT_PROBLEMS_BASE}/${id}/`),
    "Failed to delete problem"
  );
};

export const getTags = async (): Promise<Tag[]> => {
  try {
    const data = await requestJson<{ results?: TagDto[]; tags?: TagDto[] } | TagDto[]>(
      httpClient.get(`${MANAGEMENT_PROBLEMS_BASE}/tags/`),
      "Failed to fetch tags"
    );
    const tags = Array.isArray(data) ? data : data.results || data.tags || [];
    return tags.map(mapTagDto);
  } catch {
    console.warn("Failed to fetch tags");
    return [];
  }
};

export const createTag = async (
  data: { name: string; color?: string; description?: string }
): Promise<Tag> => {
  const responseData = await requestJson<TagDto>(
    httpClient.post(`${MANAGEMENT_PROBLEMS_BASE}/tags/`, data),
    "Failed to create tag"
  );
  return mapTagDto(responseData);
};

export const updateTag = async (
  slug: string,
  data: { name?: string; color?: string; description?: string }
): Promise<Tag> => {
  const responseData = await requestJson<TagDto>(
    httpClient.patch(`${MANAGEMENT_PROBLEMS_BASE}/tags/${slug}/`, data),
    "Failed to update tag"
  );
  return mapTagDto(responseData);
};

export const deleteTag = async (slug: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`${MANAGEMENT_PROBLEMS_BASE}/tags/${slug}/`),
    "Failed to delete tag"
  );
};

export const getProblemStatistics = async (
  problemId: string,
  params?: { contest?: string; limit?: number }
): Promise<ProblemStatistics> => {
  const query = buildQuery(params as Record<string, unknown>);
  const data = await requestJson<{
    submission_count?: number;
    accepted_count?: number;
    ac_rate?: number;
    status_counts?: Record<string, number>;
    trend?: any[];
  }>(
    httpClient.get(`${MANAGEMENT_PROBLEMS_BASE}/${problemId}/statistics/${query}`),
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
    httpClient.post(`${MANAGEMENT_PROBLEMS_BASE}/${problemId}/test_run/`, payload),
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
