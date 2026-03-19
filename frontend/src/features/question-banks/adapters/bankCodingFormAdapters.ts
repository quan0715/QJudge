import type { BankQuestion, CodingQuestionExt } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import type { Difficulty } from "@/core/entities/problem.entity";

/**
 * Convert a BankQuestion (with codingExt) to ProblemFormSchema for the problem editor form.
 */
export function bankQuestionToFormSchema(question: BankQuestion): ProblemFormSchema {
  const ext = question.codingExt;

  const zhTrans = ext?.translations?.find(
    (t) => t.language === "zh-TW" || t.language === "zh"
  );
  const enTrans = ext?.translations?.find((t) => t.language === "en");

  return {
    title: question.title || "",
    difficulty: (question.difficulty as Difficulty) || "medium",
    timeLimit: question.timeLimit || 1000,
    memoryLimit: question.memoryLimit || 128,
    visibility: "private",
    existingTagIds: [],
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
    testCases:
      ext?.testCases?.map((tc, idx) => ({
        input: tc.inputData || "",
        output: tc.outputData || "",
        isSample: tc.isSample ?? false,
        score: tc.score ?? 0,
        isHidden: tc.isHidden ?? false,
        order: tc.order ?? idx,
      })) || [],
    languageConfigs:
      ext?.languageConfigs?.map((lc, idx) => ({
        language: lc.language || "",
        templateCode: lc.templateCode || "",
        isEnabled: lc.isEnabled ?? true,
        order: lc.order ?? idx,
      })) || [],
    forbiddenKeywords: ext?.forbiddenKeywords || [],
    requiredKeywords: ext?.requiredKeywords || [],
  };
}

/**
 * Convert ProblemFormSchema back to UpsertBankQuestionPayload for saving.
 */
export function formSchemaToUpsertPayload(
  data: ProblemFormSchema,
  base?: Partial<BankQuestion>
): UpsertBankQuestionPayload {
  const translations: CodingQuestionExt["translations"] = [];

  if (data.translationZh.title || data.translationZh.description) {
    translations.push({
      language: "zh-TW",
      title: data.translationZh.title,
      description: data.translationZh.description,
      inputDescription: data.translationZh.inputDescription,
      outputDescription: data.translationZh.outputDescription,
      hint: data.translationZh.hint || "",
    });
  }

  if (data.translationEn.title || data.translationEn.description) {
    translations.push({
      language: "en",
      title: data.translationEn.title,
      description: data.translationEn.description,
      inputDescription: data.translationEn.inputDescription,
      outputDescription: data.translationEn.outputDescription,
      hint: data.translationEn.hint || "",
    });
  }

  return {
    questionType: "coding",
    title: data.title || data.translationZh.title || data.translationEn.title,
    difficulty: data.difficulty,
    timeLimit: data.timeLimit,
    memoryLimit: data.memoryLimit,
    order: base?.order,
    codingExt: {
      translations: translations.map((t) => ({
        language: t.language,
        title: t.title,
        description: t.description,
        input_description: t.inputDescription || "",
        output_description: t.outputDescription || "",
        hint: t.hint || "",
      })),
      testCases: data.testCases.map((tc, index) => ({
        input_data: tc.input,
        output_data: tc.output,
        is_sample: tc.isSample ?? false,
        is_hidden: tc.isHidden ?? false,
        score: tc.score ?? 0,
        order: tc.order ?? index,
      })),
      languageConfigs: data.languageConfigs
        .filter((lc) => lc.isEnabled)
        .map((lc, index) => ({
          language: lc.language,
          template_code: lc.templateCode,
          is_enabled: lc.isEnabled,
          order: lc.order ?? index,
        })),
      forbiddenKeywords: data.forbiddenKeywords || [],
      requiredKeywords: data.requiredKeywords || [],
    },
  };
}

/**
 * Build a partial UpsertBankQuestionPayload from a single field change.
 * Used by the auto-save hook to PATCH individual fields.
 */
export function buildBankCodingPatchPayload(
  fieldPath: string,
  value: unknown,
  formValues?: Record<string, unknown>
): UpsertBankQuestionPayload | null {
  const parts = fieldPath.split(".");

  // For simple top-level fields, build a minimal payload
  if (parts.length === 1) {
    switch (fieldPath) {
      case "title":
        return { questionType: "coding", title: value as string };
      case "difficulty":
        return { questionType: "coding", title: (formValues?.title as string) || "", difficulty: value as string };
      case "timeLimit":
        return { questionType: "coding", title: (formValues?.title as string) || "", timeLimit: value as number };
      case "memoryLimit":
        return { questionType: "coding", title: (formValues?.title as string) || "", memoryLimit: value as number };
    }
  }

  // For any complex field (translations, testCases, languageConfigs, keywords),
  // rebuild the full codingExt from current form values.
  if (formValues) {
    const schema = formValues as unknown as ProblemFormSchema;
    return formSchemaToUpsertPayload(schema);
  }

  return null;
}
