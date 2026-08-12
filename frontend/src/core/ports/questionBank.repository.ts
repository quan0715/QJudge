import type {
  BankQuestion,
  QuestionBank,
  BankCategory,
  QuestionInboxSummary,
  QuestionInboxSourceType,
} from "@/core/entities/question-bank.entity";

export interface CreateQuestionBankPayload {
  name: string;
  description?: string;
  category: BankCategory;
}

export interface UpdateQuestionBankPayload {
  name?: string;
  description?: string;
  icon?: string;
  cover_url?: string;
}

export interface UpsertBankQuestionPayload {
  questionType: "coding" | "exam";
  title: string;
  prompt?: string;
  options?: unknown[];
  correctAnswer?: unknown;
  metadata?: Record<string, unknown>;
  score?: number;
  order?: number;
  difficulty?: string;
  timeLimit?: number;
  memoryLimit?: number;
  codingExt?: {
    translations?: Array<Record<string, unknown>>;
    testCases?: Array<Record<string, unknown>>;
    languageConfigs?: Array<Record<string, unknown>>;
    forbiddenKeywords?: string[];
    requiredKeywords?: string[];
  };
}

export interface IQuestionBankRepository {
  getBank(bankId: string): Promise<QuestionBank>;
  listMine(): Promise<QuestionBank[]>;
  create(payload: CreateQuestionBankPayload): Promise<QuestionBank>;
  update(id: string, payload: UpdateQuestionBankPayload): Promise<QuestionBank>;
  uploadCover(id: string, file: File): Promise<string>;
  delete(id: string): Promise<void>;
  listQuestions(bankId: string): Promise<BankQuestion[]>;
  createQuestion(bankId: string, payload: UpsertBankQuestionPayload): Promise<BankQuestion>;
  updateQuestion(
    bankId: string,
    bankItemId: string,
    payload: UpsertBankQuestionPayload
  ): Promise<BankQuestion>;
  deleteQuestion(bankId: string, bankItemId: string): Promise<void>;
  clone(bankId: string, bankItemId: string, targetBankId?: string): Promise<BankQuestion>;
  listInbox(category?: BankCategory): Promise<QuestionInboxSummary>;
  ingestInbox(params: {
    targetBankId: string;
    items: Array<{ sourceType: QuestionInboxSourceType; sourceId: string }>;
  }): Promise<{
    targetBankId: string;
    requestedCount: number;
    ingestedCount: number;
    movedCount: number;
    questionIds: string[];
  }>;
}
