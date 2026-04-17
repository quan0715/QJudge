export type Difficulty = "easy" | "medium" | "hard";

export interface Tag {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  createdAt?: string; // Standardize to camelCase for internal entity
}

export interface LanguageConfig {
  language: string;
  templateCode: string;
  isEnabled: boolean;
  order?: number;
}

export interface TestCase {
  input: string;
  output: string;
  isSample: boolean;
  explanation?: string;
  score?: number;
  order?: number;
  isHidden?: boolean;
}

/**
 * Coding problem summary (list view).
 *
 * Content (title, difficulty) is owned by QuestionAsset.
 * Execution config (timeLimit, testCases, etc.) is owned by this entity.
 */
export interface CodingProblem {
  id: string;
  title: string;
  difficulty: Difficulty;
  acceptanceRate: number;
  submissionCount: number;
  acceptedCount: number;
  waCount: number;
  tleCount: number;
  mleCount: number;
  reCount: number;
  ceCount: number;
  createdBy?: string;
  tags: Tag[];

  // User specific
  isSolved: boolean;

  createdAt?: string;
}

/**
 * Coding problem detail (full content for editing/solving).
 */
export interface CodingProblemDetail extends CodingProblem {
  description: string;
  inputDescription?: string;
  outputDescription?: string;
  hint?: string;
  timeLimit?: number;
  memoryLimit?: number;
  samples?: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  testCases?: TestCase[];
  languageConfigs?: LanguageConfig[];

  // Keyword restrictions for code validation
  forbiddenKeywords?: string[];
  requiredKeywords?: string[];
}

// API payload shape for create/update/import (snake_case).
export interface ProblemUpsertTranslation {
  language: string;
  title: string;
  description: string;
  input_description: string;
  output_description: string;
  hint?: string;
}

export interface ProblemUpsertTestCase {
  input_data: string;
  output_data: string;
  is_sample: boolean;
  score?: number;
  order?: number;
  is_hidden?: boolean;
}

export interface ProblemUpsertLanguageConfig {
  language: string;
  template_code: string;
  is_enabled?: boolean;
  order?: number;
}

export interface ProblemUpsertPayload {
  title: string;
  difficulty: Difficulty;
  time_limit: number;
  memory_limit: number;
  description: string;
  input_description: string;
  output_description: string;
  hint: string;
  test_cases?: ProblemUpsertTestCase[];
  language_configs?: ProblemUpsertLanguageConfig[];
  forbidden_keywords?: string[];
  required_keywords?: string[];
  existing_tag_ids?: number[];
  new_tag_names?: string[];
}
