import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { debounce } from "@/shared/utils/debounce";
import { patchProblem } from "@/infrastructure/api/repositories/problem.repository";
import type { ProblemUpsertPayload } from "@/core/entities/problem.entity";

/**
 * Field save state
 */
export type FieldSaveStatus = "idle" | "saving" | "saved" | "error";

export interface FieldSaveState {
  status: FieldSaveStatus;
  error?: string;
  lastSaved?: Date;
}

/**
 * Global save status derived from all field states
 */
export type GlobalSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * useAutoSave hook options
 */
export interface UseAutoSaveOptions {
  /** Problem ID to save to */
  problemId: string;
  /** Debounce delay in milliseconds (default: 1500ms) */
  debounceMs?: number;
  /** Function to get current form values (needed for translation merging) */
  getFormValues?: () => Record<string, unknown>;
  /** Callback when save succeeds */
  onSaveSuccess?: (fieldPath: string, value: unknown) => void;
  /** Callback when save fails */
  onSaveError?: (fieldPath: string, error: Error) => void;
}

/**
 * Return type for useAutoSave hook
 */
export interface UseAutoSaveReturn {
  /** Current state for each field */
  fieldStates: Record<string, FieldSaveState>;
  /** Global save status derived from all field states */
  globalStatus: GlobalSaveStatus;
  /** Save a single field immediately */
  saveField: (fieldPath: string, value: unknown) => Promise<void>;
  /** Save a single field with debounce */
  debouncedSaveField: (fieldPath: string, value: unknown) => void;
  /** Cancel pending debounced saves for a field */
  cancelPendingSave: (fieldPath: string) => void;
  /** Retry a failed save */
  retrySave: (fieldPath: string) => void;
  /** Check if any field has pending changes */
  hasPendingChanges: boolean;
}

/**
 * useAutoSave - Hook for field-level auto-save with PATCH
 *
 * Features:
 * - Field-level save state tracking
 * - Debounced saves (configurable delay)
 * - Immediate save on blur
 * - Retry on error
 * - Global status derived from field states
 *
 * Usage:
 * ```tsx
 * const { fieldStates, saveField, debouncedSaveField } = useAutoSave({
 *   problemId: "123",
 *   debounceMs: 1500,
 * });
 *
 * // On input change (debounced)
 * <input onChange={(e) => debouncedSaveField("title", e.target.value)} />
 *
 * // On blur (immediate)
 * <input onBlur={(e) => saveField("title", e.target.value)} />
 *
 * // Show save indicator
 * <FieldSaveIndicator status={fieldStates["title"]?.status} />
 * ```
 */
export function useAutoSave({
  problemId,
  debounceMs = 1500,
  getFormValues,
  onSaveSuccess,
  onSaveError,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  // Field states
  const [fieldStates, setFieldStates] = useState<Record<string, FieldSaveState>>({});

  // Track pending values for retry
  const pendingValuesRef = useRef<Record<string, unknown>>({});

  // Track debounced functions per field for cancellation
  const debouncedFunctionsRef = useRef<Record<string, ReturnType<typeof debounce>>>({});

  // Cleanup debounced functions on unmount
  useEffect(() => {
    return () => {
      Object.values(debouncedFunctionsRef.current).forEach((fn) => fn.cancel());
    };
  }, []);

  // Patch mutation
  const patchMutation = useMutation({
    mutationFn: async ({ fieldPath, value }: { fieldPath: string; value: unknown }) => {
      // Build the patch payload
      // For translation fields, we need the full form values to merge
      const formValues = getFormValues?.();
      const payload = buildPatchPayload(fieldPath, value, formValues);
      return patchProblem(problemId, payload);
    },
  });

  /**
   * Update field state
   */
  const updateFieldState = useCallback(
    (fieldPath: string, state: Partial<FieldSaveState>) => {
      setFieldStates((prev) => ({
        ...prev,
        [fieldPath]: {
          ...prev[fieldPath],
          ...state,
        },
      }));
    },
    []
  );

  /**
   * Save a field immediately
   */
  const saveField = useCallback(
    async (fieldPath: string, value: unknown) => {
      // Store pending value for potential retry
      pendingValuesRef.current[fieldPath] = value;

      // Update state to saving
      updateFieldState(fieldPath, { status: "saving", error: undefined });

      try {
        await patchMutation.mutateAsync({ fieldPath, value });

        // Success
        updateFieldState(fieldPath, {
          status: "saved",
          lastSaved: new Date(),
          error: undefined,
        });

        // Clear pending value
        delete pendingValuesRef.current[fieldPath];

        // Call success callback
        onSaveSuccess?.(fieldPath, value);

        // Reset to idle after 2 seconds
        setTimeout(() => {
          setFieldStates((prev) => {
            // Only reset if still in "saved" state
            if (prev[fieldPath]?.status === "saved") {
              return {
                ...prev,
                [fieldPath]: { ...prev[fieldPath], status: "idle" },
              };
            }
            return prev;
          });
        }, 2000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "儲存失敗";
        updateFieldState(fieldPath, {
          status: "error",
          error: errorMessage,
        });

        // Call error callback
        onSaveError?.(fieldPath, error instanceof Error ? error : new Error(errorMessage));
      }
    },
    [patchMutation, updateFieldState, onSaveSuccess, onSaveError]
  );

  /**
   * Create or get debounced save function for a field
   */
  const getDebouncedSaveForField = useCallback(
    (fieldPath: string) => {
      if (!debouncedFunctionsRef.current[fieldPath]) {
        debouncedFunctionsRef.current[fieldPath] = debounce(
          (value: unknown) => saveField(fieldPath, value),
          debounceMs
        );
      }
      return debouncedFunctionsRef.current[fieldPath];
    },
    [saveField, debounceMs]
  );

  /**
   * Save a field with debounce
   */
  const debouncedSaveField = useCallback(
    (fieldPath: string, value: unknown) => {
      // Store pending value
      pendingValuesRef.current[fieldPath] = value;

      // Get or create debounced function
      const debouncedFn = getDebouncedSaveForField(fieldPath);
      debouncedFn(value);
    },
    [getDebouncedSaveForField]
  );

  /**
   * Cancel pending debounced save for a field
   */
  const cancelPendingSave = useCallback((fieldPath: string) => {
    const debouncedFn = debouncedFunctionsRef.current[fieldPath];
    if (debouncedFn) {
      debouncedFn.cancel();
    }
  }, []);

  /**
   * Retry a failed save
   */
  const retrySave = useCallback(
    (fieldPath: string) => {
      const pendingValue = pendingValuesRef.current[fieldPath];
      if (pendingValue !== undefined) {
        saveField(fieldPath, pendingValue);
      }
    },
    [saveField]
  );

  /**
   * Derive global status from field states
   */
  const globalStatus = useMemo((): GlobalSaveStatus => {
    const states = Object.values(fieldStates);
    if (states.length === 0) return "idle";

    if (states.some((s) => s.status === "saving")) return "saving";
    if (states.some((s) => s.status === "error")) return "error";
    if (states.some((s) => s.status === "saved")) return "saved";

    return "idle";
  }, [fieldStates]);

  /**
   * Check if any field has pending changes
   * Note: Uses fieldStates as a proxy trigger since refs don't cause re-renders
   */
  const hasPendingChanges = useMemo(() => {
    // Check if any field is in saving state (indicating pending work)
    const states = Object.values(fieldStates);
    return states.some((s) => s.status === "saving");
  }, [fieldStates]);

  return {
    fieldStates,
    globalStatus,
    saveField,
    debouncedSaveField,
    cancelPendingSave,
    retrySave,
    hasPendingChanges,
  };
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
  isVisible: "is_visible",
  existingTagIds: "existing_tag_ids",
  // Translation fields - need special handling
  translationZh: "translations",
  translationEn: "translations",
  // Test cases
  testCases: "test_cases",
  // Language config
  languageConfigs: "language_configs",
  forbiddenKeywords: "forbidden_keywords",
  requiredKeywords: "required_keywords",
};

/**
 * Convert a form translation object to API format
 */
function convertTranslationToApi(
  translation: Record<string, string>,
  language: string
): Record<string, string> {
  return {
    language,
    title: translation.title || "",
    description: translation.description || "",
    input_description: translation.inputDescription || "",
    output_description: translation.outputDescription || "",
    hint: translation.hint || "",
  };
}

/**
 * Build a PATCH payload from a field path and value.
 * Handles nested paths and converts camelCase to snake_case.
 * 
 * For translation fields, merges with existing form values to send complete translations.
 * This is necessary because the backend replaces ALL translations on update.
 * 
 * Examples:
 * - "title" -> { title: "value" }
 * - "timeLimit" -> { time_limit: 1000 }
 * - "translationZh.description" -> { translations: [{ language: "zh-TW", ...fullZhTranslation }, { language: "en", ...fullEnTranslation }] }
 */
function buildPatchPayload(
  fieldPath: string,
  value: unknown,
  formValues?: Record<string, unknown>
): Partial<ProblemUpsertPayload> {
  const parts = fieldPath.split(".");

  // Handle translation fields specially - need to send ALL translations
  if (parts[0] === "translationZh" || parts[0] === "translationEn") {
    const isZh = parts[0] === "translationZh";
    
    // Get both translations from form values
    const zhTranslation = (formValues?.translationZh as Record<string, string>) || {};
    const enTranslation = (formValues?.translationEn as Record<string, string>) || {};
    
    // If updating a specific field, merge the new value
    if (parts.length > 1) {
      const fieldName = parts[1];
      if (isZh) {
        zhTranslation[fieldName] = value as string;
      } else {
        enTranslation[fieldName] = value as string;
      }
    } else {
      // Full translation object replacement
      if (isZh) {
        Object.assign(zhTranslation, value as Record<string, string>);
      } else {
        Object.assign(enTranslation, value as Record<string, string>);
      }
    }
    
    // Build translations array with both languages
    const translations: Record<string, string>[] = [];
    
    // Always include Chinese translation if it has content
    if (zhTranslation.title || zhTranslation.description) {
      translations.push(convertTranslationToApi(zhTranslation, "zh-TW"));
    }
    
    // Include English translation if it has content
    if (enTranslation.title || enTranslation.description) {
      translations.push(convertTranslationToApi(enTranslation, "en"));
    }
    
    // If no translations yet, still send the one being edited
    if (translations.length === 0) {
      const targetTranslation = isZh ? zhTranslation : enTranslation;
      const language = isZh ? "zh-TW" : "en";
      translations.push(convertTranslationToApi(targetTranslation, language));
    }
    
    return { translations } as unknown as Partial<ProblemUpsertPayload>;
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
      score: tc.score ?? 0,
    }));
    return { test_cases: convertedTestCases } as unknown as Partial<ProblemUpsertPayload>;
  }

  // Handle language configs - need to convert field names
  if (parts[0] === "languageConfigs") {
    const languageConfigs = (formValues?.languageConfigs as Array<Record<string, unknown>>) || [];
    const convertedConfigs = languageConfigs.map((lc) => ({
      language: lc.language || "",
      is_enabled: lc.isEnabled ?? true,
      template_code: lc.templateCode || "",
    }));
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
