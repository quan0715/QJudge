import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  CodingProblem,
  CodingProblemDetail,
} from "@/core/entities/problem.entity";
import {
  mapProblemDto,
  mapProblemDetailDto,
} from "@/infrastructure/mappers/problem.mapper";

export const getContestProblem = async (
  contestId: string,
  contestProblemId: string
): Promise<CodingProblemDetail | undefined> => {
  const res = await httpClient.get(
    `/api/v1/contests/${contestId}/problems/${contestProblemId}/`
  );
  if (!res.ok) return undefined;
  const data = await res.json();
  return mapProblemDetailDto(data);
};

export const createContestProblem = async (
  contestId: string,
  data: { title: string; max_score?: number }
): Promise<CodingProblem> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/problems/`, data),
    "Failed to create problem"
  );
  return mapProblemDto(responseData);
};

export const duplicateContestProblem = async (
  contestId: string,
  data: { problem_id: string; max_score?: number }
): Promise<CodingProblem> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/problems/duplicate/`, data),
    "Failed to duplicate problem"
  );
  return mapProblemDto(responseData);
};

export const importContestProblemsFromBank = async (
  contestId: string,
  items: { question_bank_id: string; question_id: string }[]
): Promise<CodingProblem[]> => {
  const responseData = await requestJson<any[]>(
    httpClient.post(`/api/v1/contests/${contestId}/problems/import-from-bank/`, { items }),
    "Failed to import problems from bank"
  );
  return responseData.map(mapProblemDto);
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
    httpClient.post(`/api/v1/contests/${contestId}/problems/reorder/`, { orders }),
    "Failed to reorder problems"
  );
};

