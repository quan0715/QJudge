import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  ExamQuestion,
  ExamQuestionAnswerFormat,
  ExamQuestionScorePolicy,
  ExamQuestionType,
  OpenAnswerDocument,
} from "@/core/entities/contest.entity";
import type { ExamQuestionDto } from "@/infrastructure/api/dto/contest.dto";
import { mapExamQuestionDto } from "@/infrastructure/mappers/contest.mapper";

export interface ExamQuestionUpsertPayload {
  question_type: ExamQuestionType;
  prompt: string;
  options?: string[];
  correct_answer?: unknown;
  reference_answer_document?: OpenAnswerDocument | null;
  explanation?: string;
  explanation_document?: OpenAnswerDocument | null;
  score: number;
  score_policy?: ExamQuestionScorePolicy;
  order?: number;
  group_id?: string | null;
  order_in_group?: number | null;
  answer_format?: ExamQuestionAnswerFormat;
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
  const data = await requestJson<ExamQuestionDto[]>(
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
  const data = await requestJson<ExamQuestionDto>(
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
  const data = await requestJson<ExamQuestionDto[]>(
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
  const data = await requestJson<ExamQuestionDto[]>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/import-from-bank/`, payload),
    "Failed to import exam questions from bank"
  );

  return Array.isArray(data) ? data.map(mapExamQuestionDto) : [];
};

/**
 * Update the score policy of an exam question.
 * "excluded" removes from scoring, "full_marks" gives everyone max points.
 */
export const setExamQuestionScorePolicy = async (
  contestId: string,
  questionId: string,
  policy: ExamQuestionScorePolicy,
  config?: { redistribute_to?: string[] },
): Promise<ExamQuestion> => {
  const data: Record<string, unknown> = { score_policy: policy };
  if (config) {
    data.score_policy_config = config;
  }
  return updateExamQuestion(contestId, questionId, data);
};
