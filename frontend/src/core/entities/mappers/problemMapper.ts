import type { Problem, ProblemDetail, Tag } from '../problem.entity';

export function mapTagDto(dto: any): Tag {
  return {
    id: dto.id?.toString() || '',
    name: dto.name || '',
    slug: dto.slug || '',
    description: dto.description,
    color: dto.color,
    createdAt: dto.created_at
  };
}

export function mapProblemDto(dto: any): Problem {
  return {
    id: dto.id?.toString() || '',
    displayId: dto.display_id,
    title: dto.title || '',
    difficulty: dto.difficulty || 'medium',
    acceptanceRate: dto.acceptance_rate || 0,
    submissionCount: dto.submission_count || 0,
    acceptedCount: dto.accepted_count || 0,
    createdBy: dto.created_by,
    tags: Array.isArray(dto.tags) ? dto.tags.map(mapTagDto) : [],
    
    isPracticeVisible: !!dto.is_practice_visible,
    isVisible: dto.is_visible !== undefined ? !!dto.is_visible : true,
    isSolved: !!dto.is_solved,
    
    createdInContest: dto.created_in_contest ? {
      id: dto.created_in_contest.id?.toString(),
      title: dto.created_in_contest.title,
      startTime: dto.created_in_contest.start_time,
      endTime: dto.created_in_contest.end_time
    } : null,
    
    createdAt: dto.created_at
  };
}

export function mapProblemDetailDto(dto: any): ProblemDetail {
  const problem = mapProblemDto(dto);
  return {
    ...problem,
    description: dto.description || '',
    inputDescription: dto.input_description,
    outputDescription: dto.output_description,
    hint: dto.hint,
    timeLimit: dto.time_limit,
    memoryLimit: dto.memory_limit,
    samples: Array.isArray(dto.samples) ? dto.samples.map((s: any) => ({
      input: s.input,
      output: s.output,
      explanation: s.explanation
    })) : [],
    translations: Array.isArray(dto.translations) ? dto.translations.map((t: any) => ({
      language: t.language,
      title: t.title,
      description: t.description,
      inputDescription: t.input_description,
      outputDescription: t.output_description,
      hint: t.hint
    })) : [],
    testCases: Array.isArray(dto.test_cases) ? dto.test_cases.map((tc: any) => ({
      input: tc.input_data,
      output: tc.output_data,
      isSample: tc.is_sample,
      isHidden: tc.is_hidden,
      score: tc.score,
      explanation: tc.explanation
    })) : [],
    languageConfigs: Array.isArray(dto.language_configs) ? dto.language_configs.map((lc: any) => ({
      language: lc.language,
      templateCode: lc.template_code,
      isEnabled: lc.is_enabled
    })) : [],
    
    // Keyword restrictions
    forbiddenKeywords: Array.isArray(dto.forbidden_keywords) ? dto.forbidden_keywords : [],
    requiredKeywords: Array.isArray(dto.required_keywords) ? dto.required_keywords : []
  };
}
