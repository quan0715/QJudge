import { useFieldAutoSave } from "@/shared/hooks/useFieldAutoSave";
import type { FieldAutoSaveOptions } from "@/shared/hooks/useFieldAutoSave";
import { updateQuestion } from "@/infrastructure/api/repositories/questionBank.repository";
import { buildBankCodingPatchPayload } from "@/features/question-banks/adapters/bankCodingFormAdapters";

export type { FieldSaveState, FieldSaveStatus, GlobalSaveStatus } from "@/shared/hooks/useFieldAutoSave";
export interface UseBankCodingAutoSaveOptions extends Omit<FieldAutoSaveOptions, "target" | "write"> {
  bankId: string;
  bankItemId: string;
  getFormValues?: () => Record<string, unknown>;
}

export function useBankCodingAutoSave({ bankId, bankItemId, getFormValues, ...options }: UseBankCodingAutoSaveOptions) {
  return useFieldAutoSave({
    ...options,
    target: `${bankId}/${bankItemId}`,
    write: async (field, value) => {
      const payload = buildBankCodingPatchPayload(field, value, getFormValues?.());
      if (payload) await updateQuestion(bankId, bankItemId, payload);
    },
  });
}
