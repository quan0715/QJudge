import { useFieldAutoSave } from "@/shared/hooks/useFieldAutoSave";
import type { FieldAutoSaveOptions } from "@/shared/hooks/useFieldAutoSave";
import { patchProblem } from "@/infrastructure/api/repositories/problem.repository";
import type { ProblemUpsertPayload } from "@/core/entities/problem.entity";
import { LANGUAGE_OPTIONS } from "@/features/problems/constants/codeTemplates";

export type { FieldSaveStatus, FieldSaveState, GlobalSaveStatus,
  FieldAutoSaveReturn as UseAutoSaveReturn } from "@/shared/hooks/useFieldAutoSave";
export interface UseAutoSaveOptions extends Omit<FieldAutoSaveOptions, "target" | "write"> {
  problemId: string;
  getFormValues?: () => Record<string, unknown>;
}

export function useAutoSave({ problemId, getFormValues, ...options }: UseAutoSaveOptions) {
  return useFieldAutoSave({
    ...options,
    target: problemId,
    write: (field, value) => patchProblem(problemId, buildPatchPayload(field, value, getFormValues?.())),
  });
}

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Field name mapping from form schema to API payload
 * Form uses camelCase, API uses snake_case
 */
const FIELD_NAME_MAP: Record<string, string> = {
  // Basic fields
  title: "title",
  difficulty: "difficulty",
  timeLimit: "time_limit",
  memoryLimit: "memory_limit",
  existingTagIds: "existing_tag_ids",
  // Content fields - sent as flat fields
  translationZh: "content",
  translationEn: "content",
  // Test cases
  testCases: "test_cases",
  // Language config
  languageConfigs: "language_configs",
  forbiddenKeywords: "forbidden_keywords",
  requiredKeywords: "required_keywords",
};

/**
 * Build a PATCH payload from a field path and value.
 * Handles nested paths and converts camelCase to snake_case.
 *
 * For content fields (translationZh/translationEn), sends flat fields
 * (description, input_description, etc.) directly.
 *
 * Examples:
 * - "title" -> { title: "value" }
 * - "timeLimit" -> { time_limit: 1000 }
 * - "translationZh.description" -> { description: "value", input_description: "...", ... }
 */
function buildPatchPayload(
  fieldPath: string,
  value: unknown,
  formValues?: Record<string, unknown>
): Partial<ProblemUpsertPayload> {
  const parts = fieldPath.split(".");

  // Handle content fields — send as flat fields
  if (parts[0] === "translationZh" || parts[0] === "translationEn") {
    const translation = {
      ...((formValues?.[parts[0]] as Record<string, string>) || {}),
    };

    if (parts.length > 1) {
      translation[parts[1]] = value as string;
    } else {
      Object.assign(translation, value as Record<string, string>);
    }

    const payload: Partial<ProblemUpsertPayload> = {
      description: translation.description || "",
      input_description: translation.inputDescription || "",
      output_description: translation.outputDescription || "",
      hint: translation.hint || "",
    };

    if (translation.title) {
      payload.title = translation.title;
    }

    return payload;
  }

  // Handle test cases - need to convert field names to match backend model
  // Backend uses: input_data, output_data (not input, expected_output)
  if (parts[0] === "testCases") {
    const testCases = (formValues?.testCases as Array<Record<string, unknown>>) || [];
    const convertedTestCases = testCases.map((tc) => ({
      input_data: tc.input || "",
      output_data: tc.output || "",
      is_sample: tc.isSample ?? false,
      is_hidden: tc.isHidden ?? false,
      weight_percent: tc.score ?? 0,
    }));
    return { test_cases: convertedTestCases } as unknown as Partial<ProblemUpsertPayload>;
  }

  // Handle language configs - need to convert field names
  if (parts[0] === "languageConfigs") {
    const languageConfigs = (formValues?.languageConfigs as Array<Record<string, unknown>>) || [];
    const convertedConfigs = languageConfigs
      .map((lc, index) => ({
        language: String(lc.language || LANGUAGE_OPTIONS[index]?.id || "").trim(),
        is_enabled: lc.isEnabled ?? true,
        template_code: lc.templateCode || "",
      }))
      .filter((lc) => Boolean(lc.language));
    return { language_configs: convertedConfigs } as unknown as Partial<ProblemUpsertPayload>;
  }

  // Handle keywords - simple arrays, just need field name conversion
  if (parts[0] === "forbiddenKeywords" || parts[0] === "requiredKeywords") {
    const apiFieldName = FIELD_NAME_MAP[parts[0]];
    return { [apiFieldName]: value } as unknown as Partial<ProblemUpsertPayload>;
  }

  // Handle simple fields
  if (parts.length === 1) {
    const apiFieldName = FIELD_NAME_MAP[fieldPath] || toSnakeCase(fieldPath);
    return { [apiFieldName]: value } as unknown as Partial<ProblemUpsertPayload>;
  }

  // Handle other nested fields (shouldn't be common)
  const apiFieldName = FIELD_NAME_MAP[parts[0]] || toSnakeCase(parts[0]);
  let result: Record<string, unknown> = { [toSnakeCase(parts[parts.length - 1])]: value };
  for (let i = parts.length - 2; i >= 1; i--) {
    result = { [toSnakeCase(parts[i])]: result };
  }
  
  return { [apiFieldName]: result } as unknown as Partial<ProblemUpsertPayload>;
}

export default useAutoSave;
