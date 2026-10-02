import type { GradeAppeal, GradeAppealDetail } from "@/core/entities/gradeAppeal.entity";
import { httpClient } from "@/infrastructure/api/http.client";
import { fetchEnvelope } from "@/infrastructure/api/envelope";

const path = (contestId: string) => `/api/v1/contests/${contestId}/grade-appeals/`;
export async function getGradeAppeals(contestId: string): Promise<GradeAppeal[]> {
  return (await fetchEnvelope<GradeAppeal[]>(httpClient.get(path(contestId)))).data;
}
export async function getGradeAppeal(contestId: string, id: number): Promise<GradeAppealDetail> {
  return (await fetchEnvelope<GradeAppealDetail>(httpClient.get(`${path(contestId)}${id}/`))).data;
}
export async function createGradeAppeal(contestId: string, answerId: number, content: string): Promise<GradeAppealDetail & { created: boolean }> {
  const response = await httpClient.post(path(contestId), { exam_answer: answerId, content });
  const { data } = await fetchEnvelope<GradeAppealDetail>(Promise.resolve(response));
  return { ...data, created: response.status === 201 };
}
export async function sendGradeAppealMessage(contestId: string, id: number, content: string): Promise<GradeAppealDetail> {
  return (await fetchEnvelope<GradeAppealDetail>(httpClient.post(`${path(contestId)}${id}/messages/`, { content }))).data;
}
export async function closeGradeAppeal(contestId: string, id: number): Promise<GradeAppealDetail> {
  return (await fetchEnvelope<GradeAppealDetail>(httpClient.post(`${path(contestId)}${id}/close/`, {}))).data;
}
