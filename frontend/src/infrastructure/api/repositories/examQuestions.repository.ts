import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import type { ExamQuestionDto } from "@/infrastructure/api/dto/contest.dto";
import { mapExamQuestionDto } from "@/infrastructure/mappers/contest.mapper";

export interface ExamQuestionUpsertPayload {
  question_type: ExamQuestionType;
  prompt: string;
  options?: string[];
  correct_answer?: unknown;
  explanation?: string;
  score: number;
  order?: number;
}

export interface ExamQuestionBankImportItem {
  question_bank_id: string;
  question_id: string;
}

/**
 * Shorthand aliases understood by the backend ``?kind=`` filter. The same
 * aliases are honoured by the exam dashboard summary endpoint.
 */
export type ExamQuestionKindFilter =
  | "subjective"
  | "objective"
  | ExamQuestionType
  | Array<ExamQuestionType | "subjective" | "objective">;

const serializeKindFilter = (kind: ExamQuestionKindFilter): string => {
  if (Array.isArray(kind)) return kind.join(",");
  return kind;
};

export const getExamQuestions = async (
  contestId: string,
  opts: { kind?: ExamQuestionKindFilter } = {},
): Promise<ExamQuestion[]> => {
  const search = new URLSearchParams();
  if (opts.kind) search.set("kind", serializeKindFilter(opts.kind));
  const query = search.toString();
  const url = `/api/v1/contests/${contestId}/exam-questions/${query ? `?${query}` : ""}`;
  const data = await requestJson<ExamQuestionDto>(
    httpClient.get(url),
    "Failed to fetch exam questions",
  );

  return Array.isArray(data) ? data.map(mapExamQuestionDto) : [];
};

export const createExamQuestion = async (
  contestId: string,
  payload: ExamQuestionUpsertPayload
): Promise<ExamQuestion> => {
  const data = await requestJson<ExamQuestionDto>(
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

export const importExamQuestionsFromBank = async (
  contestId: string,
  payload: {
    items: ExamQuestionBankImportItem[];
    import_mode?: "copy" | "reference";
  }
): Promise<ExamQuestion[]> => {
  const data = await requestJson<unknown>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/import-from-bank/`, payload),
    "Failed to import exam questions from bank"
  );

  return Array.isArray(data) ? data.map(mapExamQuestionDto) : [];
};
