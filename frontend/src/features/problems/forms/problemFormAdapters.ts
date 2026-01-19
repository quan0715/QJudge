import type { ProblemYAML } from "@/shared/utils/problemYamlParser";
import type {
  ProblemDetail,
  ProblemUpsertPayload,
  Translation,
} from "@/core/entities/problem.entity";
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
    isVisible: problem.isVisible ?? true,
    existingTagIds: problem.tags?.map((t) => parseInt(t.id)) || [],
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
 * Convert YAML data to form schema.
 */
export function yamlToFormSchema(yaml: ProblemYAML): ProblemFormSchema {
  const zhTrans = yaml.translations.find(
    (t) => t.language === "zh-TW" || t.language === "zh"
  );
  const enTrans = yaml.translations.find((t) => t.language === "en");

  return {
    title: yaml.title,
    difficulty: yaml.difficulty,
    timeLimit: yaml.time_limit,
    memoryLimit: yaml.memory_limit,
    isVisible: yaml.is_visible ?? true,
    existingTagIds: [], // Tags are not in YAML format
    translationZh: {
      title: zhTrans?.title || "",
      description: zhTrans?.description || "",
      inputDescription: zhTrans?.input_description || "",
      outputDescription: zhTrans?.output_description || "",
      hint: zhTrans?.hint || "",
    },
    translationEn: {
      title: enTrans?.title || "",
      description: enTrans?.description || "",
      inputDescription: enTrans?.input_description || "",
      outputDescription: enTrans?.output_description || "",
      hint: enTrans?.hint || "",
    },
    testCases:
      yaml.test_cases?.map((tc, idx) => ({
        input: tc.input_data,
        output: tc.output_data,
        isSample: tc.is_sample,
        score: tc.score ?? 0,
        isHidden: tc.is_hidden ?? false,
        order: tc.order ?? idx,
      })) || [],
    languageConfigs:
      yaml.language_configs?.map((lc, idx) => ({
        language: lc.language,
        templateCode: lc.template_code,
        isEnabled: lc.is_enabled ?? true,
        order: lc.order ?? idx,
      })) || [],
    forbiddenKeywords: yaml.forbidden_keywords || [],
    requiredKeywords: yaml.required_keywords || [],
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
    is_visible: data.isVisible,
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
      .filter((lc) => lc.isEnabled)
      .map((lc, index) => ({
        language: lc.language,
        template_code: lc.templateCode,
        is_enabled: lc.isEnabled,
        order: lc.order ?? index,
      })),
    existing_tag_ids: data.existingTagIds,
    forbidden_keywords: data.forbiddenKeywords || [],
    required_keywords: data.requiredKeywords || [],
  };
}

/**
 * Convert YAML data to API payload format.
 */
export function yamlToApiPayload(yaml: ProblemYAML): ProblemUpsertPayload {
  return {
    title: yaml.title,
    difficulty: yaml.difficulty,
    time_limit: yaml.time_limit,
    memory_limit: yaml.memory_limit,
    is_visible: yaml.is_visible !== undefined ? yaml.is_visible : true,
    is_practice_visible:
      yaml.is_practice_visible !== undefined ? yaml.is_practice_visible : false,
    display_id: yaml.display_id,
    translations: yaml.translations.map((t) => ({
      language: t.language,
      title: t.title,
      description: t.description,
      input_description: t.input_description,
      output_description: t.output_description,
      hint: t.hint || "",
    })),
    test_cases:
      yaml.test_cases?.map((tc, index) => ({
        input_data: tc.input_data,
        output_data: tc.output_data,
        is_sample: tc.is_sample,
        score: tc.score ?? 0,
        order: tc.order ?? index,
        is_hidden: tc.is_hidden ?? false,
      })) || [],
    language_configs:
      yaml.language_configs?.map((lc, index) => ({
        language: lc.language,
        template_code: lc.template_code,
        is_enabled: lc.is_enabled ?? true,
        order: lc.order ?? index,
      })) || [],
    forbidden_keywords: yaml.forbidden_keywords || [],
    required_keywords: yaml.required_keywords || [],
  };
}
