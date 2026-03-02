import type {
  Difficulty,
  LanguageConfig,
  ProblemVisibility,
  TestCase,
  Translation,
} from "@/core/entities/problem.entity";

/**
 * Translation fields for a single language.
 */
export type TranslationFields = Omit<Translation, "language">;

/**
 * Form schema type for react-hook-form.
 */
export interface ProblemFormSchema {
  // Basic Info
  title: string;
  difficulty: Difficulty;
  timeLimit: number;
  memoryLimit: number;
  visibility: ProblemVisibility;
  existingTagIds: number[];
  newTagNames?: string[];
  // Content - Translations
  translationZh: TranslationFields;
  translationEn: TranslationFields;
  // Test Cases
  testCases: TestCase[];
  // Language Config
  languageConfigs: LanguageConfig[];
  // Code Restrictions
  forbiddenKeywords: string[];
  requiredKeywords: string[];
}

/**
 * Default form values.
 */
export const DEFAULT_PROBLEM_FORM_VALUES: ProblemFormSchema = {
  title: "",
  difficulty: "medium",
  timeLimit: 1000,
  memoryLimit: 128,
  visibility: "private",
  existingTagIds: [],
  newTagNames: [],
  translationZh: {
    title: "",
    description: "",
    inputDescription: "",
    outputDescription: "",
    hint: "",
  },
  translationEn: {
    title: "",
    description: "",
    inputDescription: "",
    outputDescription: "",
    hint: "",
  },
  testCases: [],
  languageConfigs: [],
  forbiddenKeywords: [],
  requiredKeywords: [],
};
