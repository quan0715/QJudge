import type { ProblemDetail } from "@/core/entities/problem.entity";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";

/**
 * Convert form schema to preview format
 */
export const formSchemaToPreview = (
  formData: Partial<ProblemFormSchema>
): ProblemDetail => {
  const zhTranslation = formData.translationZh;
  return {
    id: "preview",
    title: formData.title || zhTranslation?.title || "未命名題目",
    difficulty: formData.difficulty || "medium",
    description: zhTranslation?.description || "",
    inputDescription: zhTranslation?.inputDescription || "",
    outputDescription: zhTranslation?.outputDescription || "",
    hint: zhTranslation?.hint || "",
    timeLimit: formData.timeLimit || 1000,
    memoryLimit: formData.memoryLimit || 128,
    createdAt: new Date().toISOString(),
    testCases: formData.testCases || [],
    languageConfigs: formData.languageConfigs || [],
    translations: zhTranslation
      ? [{ language: "zh-TW", ...zhTranslation, title: zhTranslation.title || "" }]
      : [],
    tags: [],
    acceptanceRate: 0,
    submissionCount: 0,
    acceptedCount: 0,
    waCount: 0,
    tleCount: 0,
    mleCount: 0,
    reCount: 0,
    ceCount: 0,
    visibility: formData.visibility || "private",
    isSolved: false,
  };
};
