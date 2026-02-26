import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useFormContext } from "react-hook-form";
import {
  useExamAutoSave,
  type FieldSaveState,
  type UseExamAutoSaveReturn,
} from "../hooks/useExamAutoSave";
import type { ExamFormSchema } from "../forms/examFormSchema";
import {
  SECTION_FIELDS,
  type ExamSectionId,
} from "../forms/examFormValidation";

export type SectionValidationState = "valid" | "invalid" | "incomplete" | "none";

export interface SectionValidation {
  state: SectionValidationState;
  errorCount: number;
  errors: string[];
}

export interface ExamEditContextValue {
  contestId: string;
  autoSave: UseExamAutoSaveReturn;
  getSectionValidation: (sectionId: ExamSectionId) => SectionValidation;
  handleFieldChange: (fieldPath: string, value: unknown) => void;
  handleFieldBlur: (fieldPath: string, value: unknown) => void;
  getFieldSaveState: (fieldPath: string) => FieldSaveState | undefined;
}

const ExamEditContext = createContext<ExamEditContextValue | null>(null);

interface ExamEditProviderProps {
  children: ReactNode;
  contestId: string;
}

export const ExamEditProvider: React.FC<ExamEditProviderProps> = ({
  children,
  contestId,
}) => {
  const {
    formState: { errors, touchedFields },
    trigger,
  } = useFormContext<ExamFormSchema>();

  const autoSave = useExamAutoSave({
    contestId,
    debounceMs: 1500,
  });

  const getSectionValidation = useCallback(
    (sectionId: ExamSectionId): SectionValidation => {
      const fields = SECTION_FIELDS[sectionId];
      let errorCount = 0;
      const messages: string[] = [];

      for (const fieldPath of fields) {
        const error = (errors as Record<string, { message?: string }>)[fieldPath];
        if (error?.message) {
          errorCount++;
          messages.push(error.message);
        }
      }

      if (errorCount > 0) {
        return { state: "invalid", errorCount, errors: messages };
      }

      const hasTouched = fields.some(
        (f) => (touchedFields as Record<string, boolean>)[f]
      );

      if (hasTouched) {
        return { state: "valid", errorCount: 0, errors: [] };
      }

      return { state: "none", errorCount: 0, errors: [] };
    },
    [errors, touchedFields]
  );

  const handleFieldChange = useCallback(
    (fieldPath: string, value: unknown) => {
      trigger(fieldPath as keyof ExamFormSchema);
      autoSave.debouncedSaveField(fieldPath, value);
    },
    [autoSave, trigger]
  );

  const handleFieldBlur = useCallback(
    async (fieldPath: string, value: unknown) => {
      autoSave.cancelPendingSave(fieldPath);
      const isValid = await trigger(fieldPath as keyof ExamFormSchema);
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
    (): ExamEditContextValue => ({
      contestId,
      autoSave,
      getSectionValidation,
      handleFieldChange,
      handleFieldBlur,
      getFieldSaveState,
    }),
    [
      contestId,
      autoSave,
      getSectionValidation,
      handleFieldChange,
      handleFieldBlur,
      getFieldSaveState,
    ]
  );

  return (
    <ExamEditContext.Provider value={value}>
      {children}
    </ExamEditContext.Provider>
  );
};

export function useExamEdit(): ExamEditContextValue {
  const context = useContext(ExamEditContext);
  if (!context) {
    throw new Error("useExamEdit must be used within ExamEditProvider");
  }
  return context;
}

export default ExamEditContext;
