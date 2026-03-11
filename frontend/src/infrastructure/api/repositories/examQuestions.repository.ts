import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import { mapExamQuestionDto } from "@/infrastructure/mappers/contest.mapper";

export interface ExamQuestionUpsertPayload {
  question_type: ExamQuestionType;
  prompt: string;
  options?: string[];
  correct_answer?: unknown;
  score: number;
  order?: number;
}

export const getExamQuestions = async (contestId: string): Promise<ExamQuestion[]> => {
  const data = await requestJson<unknown>(
    httpClient.get(`/api/v1/contests/${contestId}/exam-questions/`),
    "Failed to fetch exam questions"
  );

  return Array.isArray(data) ? data.map(mapExamQuestionDto) : [];
};

export const createExamQuestion = async (
  contestId: string,
  payload: ExamQuestionUpsertPayload
): Promise<ExamQuestion> => {
  const data = await requestJson<unknown>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/`, payload),
    "Failed to create exam question"
  );
  return mapExamQuestionDto(data);
};

export const updateExamQuestion = async (
  contestId: string,
  questionId: string,
  payload: Partial<ExamQuestionUpsertPayload>
): Promise<ExamQuestion> => {
  const data = await requestJson<unknown>(
    httpClient.patch(
      `/api/v1/contests/${contestId}/exam-questions/${questionId}/`,
      payload
    ),
    "Failed to update exam question"
  );
  return mapExamQuestionDto(data);
};

export const deleteExamQuestion = async (
  contestId: string,
  questionId: string
): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/contests/${contestId}/exam-questions/${questionId}/`),
    "Failed to delete exam question"
  );
};

export const batchImportExamQuestions = async (
  contestId: string,
  questions: ExamQuestionUpsertPayload[],
): Promise<ExamQuestion[]> => {
  const data = await requestJson<unknown>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/batch-import/`, {
      questions,
    }),
    "Failed to batch import exam questions"
  );

  return Array.isArray(data) ? data.map(mapExamQuestionDto) : [];
};

export const reorderExamQuestions = async (
  contestId: string,
  orders: Array<{ id: string; order: number }>
): Promise<ExamQuestion[]> => {
  const data = await requestJson<unknown>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/reorder/`, {
      orders,
    }),
    "Failed to reorder exam questions"
  );

  return Array.isArray(data) ? data.map(mapExamQuestionDto) : [];
};
