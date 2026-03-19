import React, { createContext, useCallback, useMemo, type ReactNode } from "react";
import { useFormContext, type FieldErrors } from "react-hook-form";
import { useBankCodingAutoSave } from "@/features/question-banks/hooks/useBankCodingAutoSave";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { SECTION_FIELDS, type SectionId } from "@/features/problems/forms/problemFormValidation";
import type {
  ProblemEditContextValue,
  SectionValidation,
  SectionValidationState,
} from "@/features/problems/contexts/ProblemEditContext";
import ProblemEditContext from "@/features/problems/contexts/ProblemEditContext";
import type { FieldSaveState } from "@/features/problems/hooks/useAutoSave";

interface BankCodingEditProviderProps {
  children: ReactNode;
  questionId: string;
}

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
      if (message) messages.push(message);
    }
  }

  return { count, messages };
}

/**
 * BankCodingEditProvider - Wraps ProblemEditContext but backed by BankQuestion auto-save.
 */
export const BankCodingEditProvider: React.FC<BankCodingEditProviderProps> = ({
  children,
  questionId,
}) => {
  const {
    formState: { errors, touchedFields },
    trigger,
    getValues,
  } = useFormContext<ProblemFormSchema>();

  const autoSave = useBankCodingAutoSave({
    questionId,
    debounceMs: 1500,
    getFormValues: () => getValues() as unknown as Record<string, unknown>,
  });

  const getSectionValidation = useCallback(
    (sectionId: SectionId): SectionValidation => {
      const { count, messages } = countSectionErrors(errors, sectionId);

      if (count > 0) {
        return { state: "invalid", errorCount: count, errors: messages };
      }

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
        return { state: "valid", errorCount: 0, errors: [] };
      }

      return { state: "none", errorCount: 0, errors: [] };
    },
    [errors, touchedFields]
  );

  const handleFieldChange = useCallback(
    (fieldPath: string, value: unknown) => {
      trigger(fieldPath as keyof ProblemFormSchema);
      autoSave.debouncedSaveField(fieldPath, value);
    },
    [autoSave, trigger]
  );

  const handleFieldBlur = useCallback(
    async (fieldPath: string, value: unknown) => {
      autoSave.cancelPendingSave(fieldPath);
      const isValid = await trigger(fieldPath as keyof ProblemFormSchema);
      if (isValid) {
        autoSave.saveField(fieldPath, value);
      }
    },
    [autoSave, trigger]
  );

  const getFieldSaveState = useCallback(
    (fieldPath: string): FieldSaveState | undefined => {
      return autoSave.fieldStates[fieldPath];
    },
    [autoSave.fieldStates]
  );

  const value = useMemo(
    (): ProblemEditContextValue => ({
      problemId: questionId,
      autoSave,
      getSectionValidation,
      handleFieldChange,
      handleFieldBlur,
      getFieldSaveState,
    }),
    [questionId, autoSave, getSectionValidation, handleFieldChange, handleFieldBlur, getFieldSaveState]
  );

  return (
    <ProblemEditContext.Provider value={value}>
      {children}
    </ProblemEditContext.Provider>
  );
};
