import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Problem,
  ProblemDetail,
  ProblemUpsertPayload,
} from "@/core/entities/problem.entity";
import {
  mapProblemDto,
  mapProblemDetailDto,
} from "@/infrastructure/mappers/problem.mapper";

export const getContestProblem = async (
  contestId: string,
  problemId: string
): Promise<ProblemDetail | undefined> => {
  const res = await httpClient.get(
    `/api/v1/contests/${contestId}/problems/${problemId}/`
  );
  if (!res.ok) return undefined;
  const data = await res.json();
  return mapProblemDetailDto(data);
};

export const addContestProblem = async (
  contestId: string,
  data: { title?: string; problem_id?: string }
): Promise<Problem> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/add_problem/`, data),
    "Failed to add problem"
  );
  return mapProblemDto(responseData);
};

export const createContestProblem = async (
  contestId: string,
  data: ProblemUpsertPayload
): Promise<Problem> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/problems/`, data),
    "Failed to create problem"
  );
  return mapProblemDto(responseData);
};

export const removeContestProblem = async (
  contestId: string,
  problemId: string
): Promise<void> => {
  await ensureOk(
    httpClient.delete(
      `/api/v1/contests/${contestId}/problems/${problemId}/`
    ),
    "Failed to remove problem"
  );
};

export const reorderContestProblems = async (
  contestId: string,
  orders: { id: string | number; order: number }[]
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/reorder_problems/`, {
      orders,
    }),
    "Failed to reorder problems"
  );
};

export const publishProblemToPractice = async (
  contestId: string,
  problemId: string
): Promise<any> => {
  return requestJson<any>(
    httpClient.post(
      `/api/v1/contests/${contestId}/problems/${problemId}/publish/`
    ),
    "Failed to publish problem"
  );
};

export const publishContestProblemsToPractice = async (
  contestId: string,
  problemIds?: Array<string | number>
): Promise<{ created_problem_ids: string[]; skipped_problem_ids: string[] }> => {
  const payload: any = {};
  if (problemIds && problemIds.length > 0) {
    payload.problem_ids = problemIds;
  }
  return requestJson<{ created_problem_ids: string[]; skipped_problem_ids: string[] }>(
    httpClient.post(
      `/api/v1/contests/${contestId}/publish_to_practice/`,
      payload
    ),
    "Failed to publish problems"
  );
};
