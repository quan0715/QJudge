export type BankCategory = "coding" | "exam";
export type BankVisibility = "private" | "public";
export type BankReviewStatus = "draft" | "pending" | "approved" | "rejected";

export interface CodingQuestionExt {
  translations: Array<{
    language: string;
    title: string;
    description: string;
    inputDescription?: string;
    outputDescription?: string;
    hint?: string;
  }>;
  testCases: Array<{
    inputData: string;
    outputData: string;
    isSample: boolean;
    score?: number;
    order?: number;
    isHidden?: boolean;
  }>;
  languageConfigs: Array<{
    language: string;
    templateCode: string;
    isEnabled?: boolean;
    order?: number;
  }>;
  forbiddenKeywords: string[];
  requiredKeywords: string[];
}

export interface BankQuestion {
  id: string;
  bankItemId: string;
  bankId: string;
  questionType: "coding" | "exam";
  title: string;
  prompt: string;
  options: unknown[];
  correctAnswer: unknown;
  score: number;
  order: number;
  difficulty: string;
  timeLimit: number;
  memoryLimit: number;
  metadata?: Record<string, unknown>;
  sourceQuestionId?: string | null;
  sourceBankId?: string | null;
  sourceBankName?: string | null;
  contestUsages?: Array<{ contestId: string; contestName: string }>;
  codingExt?: CodingQuestionExt;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  icon: string;
  coverUrl: string;
  category: BankCategory;
  visibility: BankVisibility;
  verified: boolean;
  reviewStatus: BankReviewStatus;
  reviewNote?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedByUsername?: string;
  ownerUsername?: string;
  questionCount: number;
  isSubscribed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExploreBankItem extends QuestionBank {
  source: "platform";
}

export type QuestionInboxSourceType = "problem" | "exam_question";

export interface QuestionInboxItem {
  sourceType: QuestionInboxSourceType;
  sourceId: string;
  title: string;
  contestId?: string;
  contestName?: string;
  questionType?: string;
  score?: number;
  updatedAt?: string;
}

export interface QuestionInboxSummary {
  coding: QuestionInboxItem[];
  exam: QuestionInboxItem[];
  counts: {
    coding: number;
    exam: number;
  };
}
