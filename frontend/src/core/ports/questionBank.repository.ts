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
