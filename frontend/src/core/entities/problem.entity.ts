export type Difficulty = 'easy' | 'medium' | 'hard';

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
}

export interface TestCase {
  input: string;
  output: string;
  isSample: boolean;
  explanation?: string;
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
}
