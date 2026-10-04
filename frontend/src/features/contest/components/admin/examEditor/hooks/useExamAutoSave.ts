import { useFieldAutoSave } from "@/shared/hooks/useFieldAutoSave";
import type { FieldAutoSaveOptions } from "@/shared/hooks/useFieldAutoSave";
import { updateContest } from "@/infrastructure/api/repositories";
import type { ContestUpdatePayload } from "@/core/ports/contest.repository";

export type { FieldSaveStatus, FieldSaveState, GlobalSaveStatus,
  FieldAutoSaveReturn as UseExamAutoSaveReturn } from "@/shared/hooks/useFieldAutoSave";
export interface UseExamAutoSaveOptions extends Omit<FieldAutoSaveOptions, "target" | "write"> {
  contestId: string;
}

export function useExamAutoSave({ contestId, ...options }: UseExamAutoSaveOptions) {
  return useFieldAutoSave({
    ...options,
    target: contestId,
    write: (field, value) => updateContest(contestId, { [field]: value } as ContestUpdatePayload),
  });
}

export default useExamAutoSave;
