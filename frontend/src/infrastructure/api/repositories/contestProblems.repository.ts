import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Problem,
  ProblemDetail,
} from "@/core/entities/problem.entity";
import {
  mapProblemDto,
  mapProblemDetailDto,
} from "@/infrastructure/mappers/problem.mapper";

export const getContestProblem = async (
  contestId: string,
  contestProblemId: string
): Promise<ProblemDetail | undefined> => {
  const res = await httpClient.get(
    `/api/v1/contests/${contestId}/problems/${contestProblemId}/`
  );
  if (!res.ok) return undefined;
  const data = await res.json();
  return mapProblemDetailDto(data);
};

export const addContestProblem = async (
  contestId: string,
  data: {
    title?: string;
    problem_id?: string;
    question_bank_id?: string;
    question_id?: string;
    import_mode?: "copy" | "reference";
    max_score?: number;
  }
): Promise<Problem> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/add_problem/`, data),
    "Failed to add problem"
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

