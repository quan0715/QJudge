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

export interface Translation {
  language: string;
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  hint: string;
}

export interface Problem {
  id: string;
  displayId?: string;
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

  // Visibility flags
  isPracticeVisible: boolean;
  isVisible: boolean;

  // User specific
  isSolved: boolean;

  // Context
  createdInContest?: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
  } | null;

  createdAt?: string;
}

export interface ProblemDetail extends Problem {
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
  translations?: Translation[];
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
  is_visible?: boolean;
  is_practice_visible?: boolean;
  display_id?: string;
  translations: ProblemUpsertTranslation[];
  test_cases?: ProblemUpsertTestCase[];
  language_configs?: ProblemUpsertLanguageConfig[];
  forbidden_keywords?: string[];
  required_keywords?: string[];
  existing_tag_ids?: number[];
}
