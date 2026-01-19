import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useFormContext, type FieldErrors } from "react-hook-form";
import {
  useAutoSave,
  type FieldSaveState,
  type UseAutoSaveReturn,
} from "@/features/problems/hooks/useAutoSave";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import {
  SECTION_FIELDS,
  type SectionId,
} from "@/features/problems/forms/problemFormValidation";

/**
 * Validation state for a section
 */
export type SectionValidationState = "valid" | "invalid" | "incomplete" | "none";

/**
 * Section validation info
 */
export interface SectionValidation {
  state: SectionValidationState;
  errorCount: number;
  errors: string[];
}

/**
 * ProblemEditContext value
 */
export interface ProblemEditContextValue {
  /** Problem ID being edited */
  problemId: string;
  /** Auto-save functions and state */
  autoSave: UseAutoSaveReturn;
  /** Get validation state for a section */
  getSectionValidation: (sectionId: SectionId) => SectionValidation;
  /** Handle field change with auto-save (debounced) */
  handleFieldChange: (fieldPath: string, value: unknown) => void;
  /** Handle field blur with auto-save (immediate) */
  handleFieldBlur: (fieldPath: string, value: unknown) => void;
  /** Get save state for a field */
  getFieldSaveState: (fieldPath: string) => FieldSaveState | undefined;
}

const ProblemEditContext = createContext<ProblemEditContextValue | null>(null);

/**
 * ProblemEditProvider props
 */
interface ProblemEditProviderProps {
  children: ReactNode;
  problemId: string;
}

/**
 * Count errors for a specific section
 */
function countSectionErrors(
  errors: FieldErrors<ProblemFormSchema>,
  sectionId: SectionId
): { count: number; messages: string[] } {
  const fields = SECTION_FIELDS[sectionId];
  let count = 0;
  const messages: string[] = [];

  const getNestedError = (obj: unknown, path: string[]): unknown => {
    let current = obj;
    for (const key of path) {
      if (current && typeof current === "object" && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return current;
  };

  for (const fieldPath of fields) {
    const pathParts = fieldPath.split(".");
    const error = getNestedError(errors, pathParts);

    if (error && typeof error === "object" && "message" in error) {
      count++;
      const message = (error as { message?: string }).message;
      if (message) {
        messages.push(message);
      }
    }
  }

  return { count, messages };
}

/**
 * ProblemEditProvider - Provides auto-save and validation context
 */
export const ProblemEditProvider: React.FC<ProblemEditProviderProps> = ({
  children,
  problemId,
}) => {
  // Get form context
  const {
    formState: { errors, touchedFields },
    trigger,
    getValues,
  } = useFormContext<ProblemFormSchema>();

  // Auto-save hook - pass getFormValues for translation merging
  const autoSave = useAutoSave({
    problemId,
    debounceMs: 1500,
    getFormValues: () => getValues() as unknown as Record<string, unknown>,
  });

  /**
   * Get validation state for a section
   */
  const getSectionValidation = useCallback(
    (sectionId: SectionId): SectionValidation => {
      const { count, messages } = countSectionErrors(errors, sectionId);

      if (count > 0) {
        return {
          state: "invalid",
          errorCount: count,
          errors: messages,
        };
      }

      // Check if section has been touched
      const fields = SECTION_FIELDS[sectionId];
      const hasTouched = fields.some((fieldPath) => {
        const pathParts = fieldPath.split(".");
        let current: unknown = touchedFields;
        for (const part of pathParts) {
          if (current && typeof current === "object" && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return false;
          }
        }
        return !!current;
      });

      if (hasTouched) {
        return {
          state: "valid",
          errorCount: 0,
          errors: [],
        };
      }

      return {
        state: "none",
        errorCount: 0,
        errors: [],
      };
    },
    [errors, touchedFields]
  );

  /**
   * Handle field change with debounced auto-save
   */
  const handleFieldChange = useCallback(
    (fieldPath: string, value: unknown) => {
      // Trigger validation for the field
      trigger(fieldPath as keyof ProblemFormSchema);
      // Debounced save
      autoSave.debouncedSaveField(fieldPath, value);
    },
    [autoSave, trigger]
  );

  /**
   * Handle field blur with immediate auto-save
   */
  const handleFieldBlur = useCallback(
    async (fieldPath: string, value: unknown) => {
      // Cancel any pending debounced save
      autoSave.cancelPendingSave(fieldPath);
      // Trigger validation
      const isValid = await trigger(fieldPath as keyof ProblemFormSchema);
      // Only save if valid
      if (isValid) {
        autoSave.saveField(fieldPath, value);
      }
    },
    [autoSave, trigger]
  );

  /**
   * Get save state for a field
   */
  const getFieldSaveState = useCallback(
    (fieldPath: string): FieldSaveState | undefined => {
      return autoSave.fieldStates[fieldPath];
    },
    [autoSave.fieldStates]
  );

  const value = useMemo(
    (): ProblemEditContextValue => ({
      problemId,
      autoSave,
      getSectionValidation,
      handleFieldChange,
      handleFieldBlur,
      getFieldSaveState,
    }),
    [
      problemId,
      autoSave,
      getSectionValidation,
      handleFieldChange,
      handleFieldBlur,
      getFieldSaveState,
    ]
  );

  return (
    <ProblemEditContext.Provider value={value}>
      {children}
    </ProblemEditContext.Provider>
  );
};

/**
 * Hook to access ProblemEditContext
 */
export function useProblemEdit(): ProblemEditContextValue {
  const context = useContext(ProblemEditContext);
  if (!context) {
    throw new Error("useProblemEdit must be used within ProblemEditProvider");
  }
  return context;
}

export default ProblemEditContext;
