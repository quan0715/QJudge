import type {
  CodingProblem as Problem,
  CodingProblemDetail as ProblemDetail,
  Tag,
  TestCase,
  LanguageConfig,
} from "@/core/entities/problem.entity";
import type {
  ProblemDto,
  ProblemDetailDto,
  TagDto,
  TestCaseDto,
  LanguageConfigDto,
} from "@/infrastructure/api/dto/problem.dto";

export function mapTagDto(dto: TagDto): Tag {
  return {
    id: dto.id?.toString() || "",
    name: dto.name || "",
    slug: dto.slug || "",
    description: dto.description,
    color: dto.color,
    createdAt: dto.created_at,
  };
}

export function mapProblemDto(dto: ProblemDto): Problem {
  // For contest problems, use problem_id (the actual Problem ID) if available
  const problemId = (dto as any).problem_id ?? dto.id;
  return {
    id: problemId?.toString() || "",
    title: dto.title || "",
    difficulty: dto.difficulty || "medium",
    acceptanceRate: dto.acceptance_rate || 0,
    submissionCount: dto.submission_count || 0,
    acceptedCount: dto.accepted_count || 0,
    waCount: dto.wa_count || 0,
    tleCount: dto.tle_count || 0,
    mleCount: dto.mle_count || 0,
    reCount: dto.re_count || 0,
    ceCount: dto.ce_count || 0,
    createdBy: dto.created_by,
    tags: Array.isArray(dto.tags) ? dto.tags.map(mapTagDto) : [],
    isSolved: !!dto.is_solved,
    createdAt: dto.created_at,
  };
}

export function mapProblemDetailDto(dto: ProblemDetailDto): ProblemDetail {
  const problem = mapProblemDto(dto);
  return {
    ...problem,
    description: dto.description || "",
    inputDescription: dto.input_description,
    outputDescription: dto.output_description,
    hint: dto.hint,
    timeLimit: dto.time_limit,
    memoryLimit: dto.memory_limit,
    samples: Array.isArray(dto.samples)
      ? dto.samples.map((s) => ({
          input: s.input,
          output: s.output,
          explanation: s.explanation,
        }))
      : [],
    testCases: Array.isArray(dto.test_cases)
      ? dto.test_cases.map((tc: TestCaseDto): TestCase => ({
          input: tc.input_data ?? tc.input ?? "",
          output: tc.output_data ?? tc.output ?? "",
          isSample: tc.is_sample,
          isHidden: tc.is_hidden,
          score: tc.score,
          explanation: tc.explanation,
        }))
      : [],
    languageConfigs: Array.isArray(dto.language_configs)
      ? dto.language_configs.map((lc: LanguageConfigDto): LanguageConfig => ({
          language: lc.language,
          templateCode: lc.template_code,
          isEnabled: lc.is_enabled,
        }))
      : [],

    // Keyword restrictions
    forbiddenKeywords: Array.isArray(dto.forbidden_keywords)
      ? dto.forbidden_keywords
      : [],
    requiredKeywords: Array.isArray(dto.required_keywords)
      ? dto.required_keywords
      : [],
  };
}
