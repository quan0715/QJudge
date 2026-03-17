export type BankCategory = "coding" | "exam";
export type BankVisibility = "private" | "public";

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
  sourceProblemId?: string;
  sourceExamQuestionId?: string;
  codingExt?: CodingQuestionExt;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  category: BankCategory;
  visibility: BankVisibility;
  verified: boolean;
  ownerUsername?: string;
  questionCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExploreBankItem extends QuestionBank {
  source: "platform";
}

export type QuestionInboxSourceType = "problem" | "exam_question";

export interface QuestionInboxItem {
  sourceType: QuestionInboxSourceType;
  sourceId: number;
  title: string;
  contestId?: number;
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
