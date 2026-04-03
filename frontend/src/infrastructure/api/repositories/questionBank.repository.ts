import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  QuestionBank,
  BankQuestion,
  QuestionInboxSummary,
  ExploreBankItem,
  BankCategory,
} from "@/core/entities/question-bank.entity";
import type {
  IQuestionBankRepository,
  CreateQuestionBankPayload,
  UpdateQuestionBankPayload,
  UpsertBankQuestionPayload,
} from "@/core/ports/questionBank.repository";
import {
  mapQuestionBankDto,
  mapBankQuestionDto,
  mapQuestionInboxSummaryDto,
} from "@/infrastructure/mappers/questionBank.mapper";
import type {
  QuestionBankDto,
  BankQuestionDto,
  QuestionInboxSummaryDto,
} from "@/infrastructure/api/dto/question-bank.dto";

// ============================================================================
// Question Bank Repository Implementation
// ============================================================================

export const getBank = async (bankId: string): Promise<QuestionBank> => {
  const responseData = await requestJson<QuestionBankDto>(
    httpClient.get(`/api/v1/question-banks/${bankId}/`),
    "Failed to fetch question bank"
  );
  return mapQuestionBankDto(responseData);
};

export const listMine = async (): Promise<QuestionBank[]> => {
  const data = await requestJson<{ results?: QuestionBankDto[] } | QuestionBankDto[]>(
    httpClient.get(`/api/v1/question-banks/mine/`),
    "Failed to fetch my question banks"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapQuestionBankDto);
};

export const listExplore = async (): Promise<ExploreBankItem[]> => {
  const data = await requestJson<{ results?: QuestionBankDto[] } | QuestionBankDto[]>(
    httpClient.get(`/api/v1/question-banks/explore/`),
    "Failed to fetch explore banks"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map((dto) => ({
    ...mapQuestionBankDto(dto),
    source: "platform",
  }));
};

export const create = async (payload: CreateQuestionBankPayload): Promise<QuestionBank> => {
  const responseData = await requestJson<QuestionBankDto>(
    httpClient.post(`/api/v1/question-banks/`, payload),
    "Failed to create question bank"
  );
  return mapQuestionBankDto(responseData);
};

export const update = async (id: string, payload: UpdateQuestionBankPayload): Promise<QuestionBank> => {
  const responseData = await requestJson<QuestionBankDto>(
    httpClient.patch(`/api/v1/question-banks/${id}/`, payload),
    "Failed to update question bank"
  );
  return mapQuestionBankDto(responseData);
};

export const uploadCover = async (id: string, file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const data = await requestJson<{ cover_url: string }>(
    httpClient.post(`/api/v1/question-banks/${id}/upload_cover/`, formData),
    "Failed to upload cover"
  );
  return data.cover_url;
};

export const submitForReview = async (id: string): Promise<QuestionBank> => {
  const responseData = await requestJson<QuestionBankDto>(
    httpClient.post(`/api/v1/question-banks/${id}/submit_for_review/`),
    "Failed to submit for review"
  );
  return mapQuestionBankDto(responseData);
};

export const review = async (
  id: string,
  payload: { decision: "approve" | "reject"; note?: string }
): Promise<QuestionBank> => {
  const responseData = await requestJson<QuestionBankDto>(
    httpClient.post(`/api/v1/question-banks/${id}/review/`, payload),
    "Failed to review bank"
  );
  return mapQuestionBankDto(responseData);
};

export const listReviewQueue = async (): Promise<QuestionBank[]> => {
  const data = await requestJson<{ results?: QuestionBankDto[] } | QuestionBankDto[]>(
    httpClient.get(`/api/v1/question-banks/review-queue/`),
    "Failed to fetch review queue"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapQuestionBankDto);
};

export const deleteBank = async (id: string): Promise<void> => {
  await ensureOk(httpClient.delete(`/api/v1/question-banks/${id}/`), "Failed to delete question bank");
};

// Questions
export const listQuestions = async (bankId: string): Promise<BankQuestion[]> => {
  const data = await requestJson<{ results?: BankQuestionDto[] } | BankQuestionDto[]>(
    httpClient.get(`/api/v1/question-banks/${bankId}/questions/`),
    "Failed to fetch questions"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapBankQuestionDto);
};

export const createQuestion = async (bankId: string, payload: UpsertBankQuestionPayload): Promise<BankQuestion> => {
  const responseData = await requestJson<BankQuestionDto>(
    httpClient.post(`/api/v1/question-banks/${bankId}/questions/`, payload),
    "Failed to create question"
  );
  return mapBankQuestionDto(responseData);
};

export const updateQuestion = async (bankItemId: string, payload: UpsertBankQuestionPayload): Promise<BankQuestion> => {
  const responseData = await requestJson<BankQuestionDto>(
    httpClient.patch(`/api/v1/question-banks/items/${bankItemId}/`, payload),
    "Failed to update question"
  );
  return mapBankQuestionDto(responseData);
};

export const deleteQuestion = async (bankItemId: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/question-banks/items/${bankItemId}/`),
    "Failed to delete question"
  );
};

export const clone = async (bankItemId: string, targetBankId?: string): Promise<BankQuestion> => {
  const responseData = await requestJson<BankQuestionDto>(
    httpClient.post(`/api/v1/question-banks/items/${bankItemId}/clone/`, { target_bank_id: targetBankId }),
    "Failed to clone question"
  );
  return mapBankQuestionDto(responseData);
};

// Inbox
export const listInbox = async (category?: BankCategory): Promise<QuestionInboxSummary> => {
  const query = category ? `?category=${category}` : "";
  const data = await requestJson<QuestionInboxSummaryDto>(
    httpClient.get(`/api/v1/question-banks/inbox/${query}`),
    "Failed to fetch inbox"
  );
  return mapQuestionInboxSummaryDto(data);
};

export const ingestInbox = async (params: {
  targetBankId: string;
  items: Array<{ sourceType: string; sourceId: string }>;
}): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/question-banks/${params.targetBankId}/ingest/`, { items: params.items }),
    "Failed to ingest questions"
  );
};

// ============================================================================
// Repository Instance
// ============================================================================

export const questionBankRepository: IQuestionBankRepository = {
  getBank,
  listMine,
  listExplore,
  create,
  update,
  uploadCover,
  submitForReview,
  review,
  listReviewQueue,
  delete: deleteBank,
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  clone,
  listInbox,
  ingestInbox,
};

export default questionBankRepository;
