import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { debounce } from "@/shared/utils/debounce";
import { updateContest } from "@/infrastructure/api/repositories";
import type { ContestUpdatePayload } from "@/core/ports/contest.repository";

export type FieldSaveStatus = "idle" | "saving" | "saved" | "error";

export interface FieldSaveState {
  status: FieldSaveStatus;
  error?: string;
  lastSaved?: Date;
}

export type GlobalSaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseExamAutoSaveOptions {
  contestId: string;
  debounceMs?: number;
  onSaveSuccess?: (fieldPath: string, value: unknown) => void;
  onSaveError?: (fieldPath: string, error: Error) => void;
}

export interface UseExamAutoSaveReturn {
  fieldStates: Record<string, FieldSaveState>;
  globalStatus: GlobalSaveStatus;
  saveField: (fieldPath: string, value: unknown) => Promise<void>;
  debouncedSaveField: (fieldPath: string, value: unknown) => void;
  cancelPendingSave: (fieldPath: string) => void;
  retrySave: (fieldPath: string) => void;
  hasPendingChanges: boolean;
}

const FIELD_NAME_MAP: Record<string, keyof ContestUpdatePayload> = {
  name: "name",
  description: "description",
  rules: "rules",
  startTime: "startTime",
  endTime: "endTime",
  status: "status",
  visibility: "visibility",
  password: "password",
  cheatDetectionEnabled: "cheatDetectionEnabled",
  scoreboardVisibleDuringContest: "scoreboardVisibleDuringContest",
  anonymousModeEnabled: "anonymousModeEnabled",
  maxCheatWarnings: "maxCheatWarnings",
  allowMultipleJoins: "allowMultipleJoins",
  allowAutoUnlock: "allowAutoUnlock",
  autoUnlockMinutes: "autoUnlockMinutes",
};

export function useExamAutoSave({
  contestId,
  debounceMs = 1500,
  onSaveSuccess,
  onSaveError,
}: UseExamAutoSaveOptions): UseExamAutoSaveReturn {
  const [fieldStates, setFieldStates] = useState<Record<string, FieldSaveState>>({});
  const pendingValuesRef = useRef<Record<string, unknown>>({});
  const debouncedFunctionsRef = useRef<Record<string, ReturnType<typeof debounce>>>({});

  useEffect(() => {
    const fns = debouncedFunctionsRef.current;
    return () => {
      Object.values(fns).forEach((fn) => fn.cancel());
    };
  }, []);

  const patchMutation = useMutation({
    mutationFn: async ({ fieldPath, value }: { fieldPath: string; value: unknown }) => {
      const apiFieldName = FIELD_NAME_MAP[fieldPath] || fieldPath;
      const payload: ContestUpdatePayload = { [apiFieldName]: value };
      return updateContest(contestId, payload);
    },
  });

  const updateFieldState = useCallback((fieldPath: string, state: Partial<FieldSaveState>) => {
    setFieldStates((prev) => ({
      ...prev,
      [fieldPath]: {
        ...prev[fieldPath],
        ...state,
      },
    }));
  }, []);

  const saveField = useCallback(
    async (fieldPath: string, value: unknown) => {
      pendingValuesRef.current[fieldPath] = value;
      updateFieldState(fieldPath, { status: "saving", error: undefined });

      try {
        await patchMutation.mutateAsync({ fieldPath, value });

        updateFieldState(fieldPath, {
          status: "saved",
          lastSaved: new Date(),
          error: undefined,
        });

        delete pendingValuesRef.current[fieldPath];
        onSaveSuccess?.(fieldPath, value);

        setTimeout(() => {
          setFieldStates((prev) => {
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
        onSaveError?.(fieldPath, error instanceof Error ? error : new Error(errorMessage));
      }
    },
    [patchMutation, updateFieldState, onSaveSuccess, onSaveError]
  );

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

  const debouncedSaveField = useCallback(
    (fieldPath: string, value: unknown) => {
      pendingValuesRef.current[fieldPath] = value;
      const debouncedFn = getDebouncedSaveForField(fieldPath);
      debouncedFn(value);
    },
    [getDebouncedSaveForField]
  );

  const cancelPendingSave = useCallback((fieldPath: string) => {
    const debouncedFn = debouncedFunctionsRef.current[fieldPath];
    if (debouncedFn) {
      debouncedFn.cancel();
    }
  }, []);

  const retrySave = useCallback(
    (fieldPath: string) => {
      const pendingValue = pendingValuesRef.current[fieldPath];
      if (pendingValue !== undefined) {
        saveField(fieldPath, pendingValue);
      }
    },
    [saveField]
  );

  const globalStatus = useMemo((): GlobalSaveStatus => {
    const states = Object.values(fieldStates);
    if (states.length === 0) return "idle";
    if (states.some((s) => s.status === "saving")) return "saving";
    if (states.some((s) => s.status === "error")) return "error";
    if (states.some((s) => s.status === "saved")) return "saved";
    return "idle";
  }, [fieldStates]);

  const hasPendingChanges = useMemo(() => {
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

export default useExamAutoSave;
