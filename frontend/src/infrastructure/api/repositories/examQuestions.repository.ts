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

export interface ExamQuestionBankImportItem {
  question_bank_id: string;
  question_id: string;
}

export type ExamQuestionImportMode =
  | "append"
  | "replace_all"
  | "replace_manual_only";

export interface ExamQuestionImportPreviewSummary {
  mode: ExamQuestionImportMode;
  will_add: number;
  will_delete: number;
  will_keep: number;
  score_before: number;
  score_after: number;
  score_delta: number;
}

export interface ExamQuestionImportPreviewResponse {
  summary: ExamQuestionImportPreviewSummary;
  fingerprint: string;
}

export interface ExamQuestionImportApplyResponse {
  session_id: string;
  applied_summary: ExamQuestionImportPreviewSummary;
  questions: ExamQuestion[];
}

export interface ExamQuestionImportRollbackResponse {
  rolled_back: boolean;
  restored_count: number;
  session_id: string;
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

export const previewExamQuestionsImport = async (
  contestId: string,
  payload: {
    payload_json: string | Record<string, unknown>;
    import_mode: ExamQuestionImportMode;
  },
): Promise<ExamQuestionImportPreviewResponse> => {
  return requestJson<ExamQuestionImportPreviewResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/import/preview/`, payload),
    "Failed to preview exam question import"
  );
};

export const applyExamQuestionsImport = async (
  contestId: string,
  payload: {
    payload_json: string | Record<string, unknown>;
    import_mode: ExamQuestionImportMode;
    fingerprint?: string;
    client_request_id?: string;
  },
): Promise<ExamQuestionImportApplyResponse> => {
  const data = await requestJson<Omit<ExamQuestionImportApplyResponse, "questions"> & { questions: unknown[] }>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/import/apply/`, payload),
    "Failed to apply exam question import"
  );

  return {
    ...data,
    questions: Array.isArray(data.questions) ? data.questions.map(mapExamQuestionDto) : [],
  };
};

export const rollbackExamQuestionsImport = async (
  contestId: string,
  payload: {
    session_id: string;
  }
): Promise<ExamQuestionImportRollbackResponse> => {
  return requestJson<ExamQuestionImportRollbackResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-questions/import/rollback/`, payload),
    "Failed to rollback exam question import"
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
