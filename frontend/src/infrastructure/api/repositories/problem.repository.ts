import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type { Tag } from "@/core/entities/problem.entity";
import type {
  TestRunPayload,
  TestRunResult,
} from "@/core/ports/problem.repository";
import { mapTagDto } from "@/infrastructure/mappers/problem.mapper";
import type { TagDto } from "@/infrastructure/api/dto/problem.dto";

const MANAGEMENT_PROBLEMS_BASE = "/api/v1/management/problems";

// ============================================================================
// Problem Repository Implementation
// ============================================================================

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
