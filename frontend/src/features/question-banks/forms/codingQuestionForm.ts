import type { BankQuestion } from "@/core/entities/question-bank.entity";
import { DEFAULT_PROBLEM_FORM_VALUES, type ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";

export function bankQuestionToForm(question: BankQuestion): ProblemFormSchema {
  const ext = question.codingExt;
  const content = ext?.translations.find(({ language }) => language === "zh-TW" || language === "zh");
  return {
    ...DEFAULT_PROBLEM_FORM_VALUES,
    title: question.title,
    difficulty: question.difficulty === "easy" || question.difficulty === "hard" ? question.difficulty : "medium",
    timeLimit: question.timeLimit,
    memoryLimit: question.memoryLimit,
    translationZh: {
      title: question.title,
      description: content?.description ?? "",
      inputDescription: content?.inputDescription ?? "",
      outputDescription: content?.outputDescription ?? "",
      hint: content?.hint ?? "",
    },
    testCases: ext?.testCases.map(tc => ({
      input: tc.inputData, output: tc.outputData, isSample: tc.isSample,
      isHidden: tc.isHidden ?? false, weightPercent: tc.weightPercent ?? 0,
    })) ?? [],
    languageConfigs: ext?.languageConfigs.map(lc => ({ ...lc, isEnabled: lc.isEnabled ?? true })) ?? [],
    forbiddenKeywords: ext?.forbiddenKeywords ?? [],
    requiredKeywords: ext?.requiredKeywords ?? [],
  };
}

// The bank endpoint accepts canonical flat content, not translations.
// Omit bank metadata, ordering and contest scores: editing content must preserve them.
export function bankQuestionFormPayload(form: ProblemFormSchema) {
  return {
    question_type: "coding" as const,
    title: form.title,
    difficulty: form.difficulty,
    time_limit: form.timeLimit,
    memory_limit: form.memoryLimit,
    coding_ext: {
      description: form.translationZh.description,
      input_description: form.translationZh.inputDescription,
      output_description: form.translationZh.outputDescription,
      hint: form.translationZh.hint,
      test_cases: form.testCases.map((tc, order) => ({
        input_data: tc.input, output_data: tc.output, is_sample: tc.isSample,
        is_hidden: tc.isHidden ?? false, weight_percent: tc.weightPercent ?? 0, order,
      })),
      language_configs: form.languageConfigs.map((lc, order) => ({
        language: lc.language, template_code: lc.templateCode, is_enabled: lc.isEnabled, order,
      })),
      forbidden_keywords: form.forbiddenKeywords,
      required_keywords: form.requiredKeywords,
    },
  };
}
