import type {
  CodingProblemDetail,
} from "@/core/entities/problem.entity";
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
