import type {
  CodingProblemDetail,
  ProblemUpsertPayload,
} from "@/core/entities/problem.entity";
import { LANGUAGE_OPTIONS } from "@/features/problems/constants/codeTemplates";
import type { ProblemFormSchema } from "./problemFormSchema";

/**
 * Transform ProblemDetail entity to ProblemFormSchema for react-hook-form.
 *
 * Content fields (description, inputDescription, etc.) come from the entity's
 * flat fields, which the backend reads from QuestionAsset.payload.
 */
export function problemDetailToFormSchema(
  problem: CodingProblemDetail | null | undefined
): ProblemFormSchema | undefined {
  if (!problem) return undefined;

  return {
    title: problem.title || "",
    difficulty: problem.difficulty || "medium",
    timeLimit: problem.timeLimit || 1000,
    memoryLimit: problem.memoryLimit || 128,
    existingTagIds: problem.tags?.map((t) => parseInt(t.id)) || [],
    newTagNames: [],
    translationZh: {
      title: problem.title || "",
      description: problem.description || "",
      inputDescription: problem.inputDescription || "",
      outputDescription: problem.outputDescription || "",
      hint: problem.hint || "",
    },
    translationEn: {
      title: "",
      description: "",
      inputDescription: "",
      outputDescription: "",
      hint: "",
    },
    testCases: problem.testCases || [],
    languageConfigs: problem.languageConfigs || [],
    forbiddenKeywords: problem.forbiddenKeywords || [],
    requiredKeywords: problem.requiredKeywords || [],
  };
}

/**
 * Convert ProblemFormSchema to API payload format.
 * Used when calling updateProblem / createProblem API.
 */
export function formSchemaToApiPayload(
  data: ProblemFormSchema
): ProblemUpsertPayload {
  const active = data.translationZh.description
    ? data.translationZh
    : data.translationEn;

  return {
    title: data.title || active.title,
    difficulty: data.difficulty,
    time_limit: data.timeLimit,
    memory_limit: data.memoryLimit,
    description: active.description || "",
    input_description: active.inputDescription || "",
    output_description: active.outputDescription || "",
    hint: active.hint || "",
    test_cases: data.testCases.map((tc, index) => ({
      input_data: tc.input,
      output_data: tc.output,
      is_sample: tc.isSample,
      is_hidden: tc.isHidden ?? false,
      weight_percent: tc.score ?? 0,
      order: tc.order ?? index,
    })),
    language_configs: data.languageConfigs
      .map((lc, index) => ({
        language: (lc.language || LANGUAGE_OPTIONS[index]?.id || "").trim(),
        template_code: lc.templateCode,
        is_enabled: lc.isEnabled,
        order: lc.order ?? index,
      }))
      .filter((lc) => lc.is_enabled && Boolean(lc.language)),
    existing_tag_ids: data.existingTagIds,
    new_tag_names: data.newTagNames,
    forbidden_keywords: data.forbiddenKeywords || [],
    required_keywords: data.requiredKeywords || [],
  };
}
