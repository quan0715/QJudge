import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import { buildQuery } from "@/infrastructure/api/utils/buildQuery.client";
import type {
  CodingProblem,
  CodingProblemDetail,
  ProblemUpsertPayload,
  Tag,
} from "@/core/entities/problem.entity";
import type {
  GetProblemsParams,
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

export const testRun = async (
  problemId: string,
  payload: TestRunPayload
): Promise<TestRunResult> => {
  return requestJson<TestRunResult>(
    httpClient.post(`${MANAGEMENT_PROBLEMS_BASE}/${problemId}/test_run/`, payload),
    "Test run failed"
  );
};

export const getTestRunProgress = (problemId: string, runId: string): Promise<TestRunResult> =>
  requestJson<TestRunResult>(httpClient.get(`${MANAGEMENT_PROBLEMS_BASE}/${problemId}/test_run_status/?run_id=${encodeURIComponent(runId)}`), "Test run progress failed");
