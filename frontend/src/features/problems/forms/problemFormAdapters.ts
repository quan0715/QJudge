import type {
  ProblemDetail,
  ProblemUpsertPayload,
  Translation,
} from "@/core/entities/problem.entity";
import { LANGUAGE_OPTIONS } from "@/features/problems/constants/codeTemplates";
import type { ProblemFormSchema } from "./problemFormSchema";

const getTranslation = (
  translations: Translation[] | undefined,
  lang: string
): Translation | undefined => translations?.find((t) => t.language === lang);

/**
 * Transform ProblemDetail entity to ProblemFormSchema for react-hook-form.
 */
export function problemDetailToFormSchema(
  problem: ProblemDetail | null | undefined
): ProblemFormSchema | undefined {
  if (!problem) return undefined;

  const zhTrans = getTranslation(problem.translations, "zh-TW");
  const enTrans = getTranslation(problem.translations, "en");

  return {
    title: problem.title || "",
    difficulty: problem.difficulty || "medium",
    timeLimit: problem.timeLimit || 1000,
    memoryLimit: problem.memoryLimit || 128,
    existingTagIds: problem.tags?.map((t) => parseInt(t.id)) || [],
    newTagNames: [],
    translationZh: {
      title: zhTrans?.title || "",
      description: zhTrans?.description || "",
      inputDescription: zhTrans?.inputDescription || "",
      outputDescription: zhTrans?.outputDescription || "",
      hint: zhTrans?.hint || "",
    },
    translationEn: {
      title: enTrans?.title || "",
      description: enTrans?.description || "",
      inputDescription: enTrans?.inputDescription || "",
      outputDescription: enTrans?.outputDescription || "",
      hint: enTrans?.hint || "",
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
  const translations = [];

  if (data.translationZh.title || data.translationZh.description) {
    translations.push({
      language: "zh-TW",
      title: data.translationZh.title,
      description: data.translationZh.description,
      input_description: data.translationZh.inputDescription,
      output_description: data.translationZh.outputDescription,
      hint: data.translationZh.hint || "",
    });
  }

  if (data.translationEn.title || data.translationEn.description) {
    translations.push({
      language: "en",
      title: data.translationEn.title,
      description: data.translationEn.description,
      input_description: data.translationEn.inputDescription,
      output_description: data.translationEn.outputDescription,
      hint: data.translationEn.hint || "",
    });
  }

  return {
    title: data.title || data.translationZh.title || data.translationEn.title,
    difficulty: data.difficulty,
    time_limit: data.timeLimit,
    memory_limit: data.memoryLimit,
    translations,
    test_cases: data.testCases.map((tc, index) => ({
      input_data: tc.input,
      output_data: tc.output,
      is_sample: tc.isSample,
      is_hidden: tc.isHidden ?? false,
      score: tc.score ?? 0,
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
