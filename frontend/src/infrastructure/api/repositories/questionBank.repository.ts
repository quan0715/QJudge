import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  QuestionBank,
  BankQuestion,
  QuestionInboxSummary,
} from "@/core/entities/question-bank.entity";
import type {
  IQuestionBankRepository,
  CreateBankPayload,
  UpdateBankPayload,
  UpdateQuestionPayload,
  ImportQuestionPayload,
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
} from "../api/dto/question-bank.dto";

// ============================================================================
// Question Bank Repository Implementation
// ============================================================================

export const getQuestionBanks = async (scope?: string): Promise<QuestionBank[]> => {
  const query = scope ? `?scope=${scope}` : "";
  const data = await requestJson<{ results?: QuestionBankDto[] } | QuestionBankDto[]>(
    httpClient.get(`/api/v1/question-banks/${query}`),
    "Failed to fetch question banks"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapQuestionBankDto);
};

export const getQuestionBank = async (id: string): Promise<QuestionBank | undefined> => {
  const res = await httpClient.get(`/api/v1/question-banks/${id}/`);
  if (!res.ok) return undefined;
  const data = await res.json() as QuestionBankDto;
  return mapQuestionBankDto(data);
};

export const createQuestionBank = async (data: CreateBankPayload): Promise<QuestionBank> => {
  const responseData = await requestJson<QuestionBankDto>(
    httpClient.post(`/api/v1/question-banks/`, data),
    "Failed to create question bank"
  );
  return mapQuestionBankDto(responseData);
};

export const updateQuestionBank = async (id: string, data: UpdateBankPayload): Promise<QuestionBank> => {
  const responseData = await requestJson<QuestionBankDto>(
    httpClient.patch(`/api/v1/question-banks/${id}/`, data),
    "Failed to update question bank"
  );
  return mapQuestionBankDto(responseData);
};

export const deleteQuestionBank = async (id: string): Promise<void> => {
  await ensureOk(httpClient.delete(`/api/v1/question-banks/${id}/`), "Failed to delete question bank");
};

// Questions within a bank
export const getBankQuestions = async (bankId: string): Promise<BankQuestion[]> => {
  const data = await requestJson<{ results?: BankQuestionDto[] } | BankQuestionDto[]>(
    httpClient.get(`/api/v1/question-banks/${bankId}/questions/`),
    "Failed to fetch questions"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapBankQuestionDto);
};

export const getBankQuestion = async (bankId: string, itemId: string): Promise<BankQuestion> => {
  const responseData = await requestJson<BankQuestionDto>(
    httpClient.get(`/api/v1/question-banks/${bankId}/questions/${itemId}/`),
    "Failed to fetch question"
  );
  return mapBankQuestionDto(responseData);
};

export const createBankQuestion = async (bankId: string, data: any): Promise<BankQuestion> => {
  const responseData = await requestJson<BankQuestionDto>(
    httpClient.post(`/api/v1/question-banks/${bankId}/questions/`, data),
    "Failed to create question"
  );
  return mapBankQuestionDto(responseData);
};

export const updateBankQuestion = async (bankId: string, itemId: string, data: UpdateQuestionPayload): Promise<BankQuestion> => {
  const responseData = await requestJson<BankQuestionDto>(
    httpClient.patch(`/api/v1/question-banks/${bankId}/questions/${itemId}/`, data),
    "Failed to update question"
  );
  return mapBankQuestionDto(responseData);
};

export const deleteBankQuestion = async (bankId: string, itemId: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/question-banks/${bankId}/questions/${itemId}/`),
    "Failed to delete question"
  );
};

// Ingest / Inbox
export const getQuestionInbox = async (): Promise<QuestionInboxSummary> => {
  const data = await requestJson<QuestionInboxSummaryDto>(
    httpClient.get(`/api/v1/question-banks/inbox/`),
    "Failed to fetch inbox"
  );
  return mapQuestionInboxSummaryDto(data);
};

export const ingestFromInbox = async (bankId: string, items: ImportQuestionPayload[]): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/question-banks/${bankId}/ingest/`, { items }),
    "Failed to ingest questions"
  );
};

// Explore / Marketplace
export const getExploreBanks = async (): Promise<QuestionBank[]> => {
  const data = await requestJson<{ results?: QuestionBankDto[] } | QuestionBankDto[]>(
    httpClient.get(`/api/v1/question-banks/explore/`),
    "Failed to fetch explore banks"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapQuestionBankDto);
};

// ============================================================================
// Repository Instance
// ============================================================================

export const questionBankRepository: IQuestionBankRepository = {
  getQuestionBanks,
  getQuestionBank,
  createQuestionBank,
  updateQuestionBank,
  deleteQuestionBank,
  getBankQuestions,
  getBankQuestion,
  createBankQuestion,
  updateBankQuestion,
  deleteBankQuestion,
  getQuestionInbox,
  ingestFromInbox,
  getExploreBanks,
};

export default questionBankRepository;
