import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FieldSaveStatus = "idle" | "saving" | "saved" | "error";
export type GlobalSaveStatus = FieldSaveStatus;
export interface FieldSaveState {
  status: FieldSaveStatus;
  error?: string;
  lastSaved?: Date;
}
export interface FieldAutoSaveOptions {
  target: string;
  write: (field: string, value: unknown) => Promise<unknown>;
  debounceMs?: number;
  onSaveSuccess?: (field: string, value: unknown) => void;
  onSaveError?: (field: string, error: Error) => void;
}
export interface FieldAutoSaveReturn {
  fieldStates: Record<string, FieldSaveState>;
  globalStatus: GlobalSaveStatus;
  saveField: (field: string, value: unknown) => Promise<void>;
  debouncedSaveField: (field: string, value: unknown) => void;
  cancelPendingSave: (field: string) => void;
  retrySave: (field: string) => void;
  hasPendingChanges: boolean;
}
type PendingSave = { value: unknown; write: FieldAutoSaveOptions["write"] };

export function useFieldAutoSave(options: FieldAutoSaveOptions): FieldAutoSaveReturn {
  const { target, debounceMs = 1500 } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const [fieldStates, setFieldStates] = useState<Record<string, FieldSaveState>>({});
  const queue = useMemo(() => ({
    target,
    active: true,
    pending: new Map<string, PendingSave>(),
    timers: new Map<string, ReturnType<typeof setTimeout>>(),
    chain: Promise.resolve(),
  }), [target]);

  const update = useCallback((field: string, state: FieldSaveState) => {
    if (queue.active) setFieldStates(previous => ({ ...previous, [field]: state }));
  }, [queue]);

  const flush = useCallback((field: string): Promise<void> => {
    const chain = queue.chain.then(async () => {
      const pending = queue.pending.get(field);
      if (!pending) return;
      try {
        await pending.write(field, pending.value);
        if (queue.pending.get(field) === pending) {
          queue.pending.delete(field);
          update(field, { status: "saved", lastSaved: new Date() });
          if (queue.active) callbacks.current.onSaveSuccess?.(field, pending.value);
        }
      } catch (cause) {
        if (queue.pending.get(field) === pending) {
          const error = cause instanceof Error ? cause : new Error("儲存失敗");
          update(field, { status: "error", error: error.message });
          if (queue.active) callbacks.current.onSaveError?.(field, error);
        }
      }
    });
    queue.chain = chain;
    return chain;
  }, [queue, update]);

  useEffect(() => {
    queue.active = true;
    setFieldStates({});
    return () => {
      queue.active = false;
      for (const [field, timer] of queue.timers) {
        clearTimeout(timer);
        void flush(field);
      }
      queue.timers.clear();
    };
  }, [queue, flush]);

  const cancelPendingSave = useCallback((field: string) => {
    const timer = queue.timers.get(field);
    if (timer !== undefined) {
      clearTimeout(timer);
      queue.timers.delete(field);
    }
  }, [queue]);

  const storeValue = useCallback((field: string, value: unknown) => {
    queue.pending.set(field, { value, write: callbacks.current.write });
    update(field, { status: "saving" });
    cancelPendingSave(field);
  }, [queue, update, cancelPendingSave]);

  const saveField = useCallback((field: string, value: unknown) => {
    storeValue(field, value);
    return flush(field);
  }, [storeValue, flush]);

  const debouncedSaveField = useCallback((field: string, value: unknown) => {
    storeValue(field, value);
    queue.timers.set(field, setTimeout(() => {
      queue.timers.delete(field);
      void flush(field);
    }, debounceMs));
  }, [storeValue, queue, flush, debounceMs]);

  const retrySave = useCallback((field: string) => {
    if (queue.pending.has(field)) {
      update(field, { status: "saving" });
      void flush(field);
    }
  }, [queue, update, flush]);

  const states = Object.values(fieldStates);
  const globalStatus = (["saving", "error", "saved"] as const).find(
    status => states.some(state => state.status === status),
  ) ?? "idle";
  return {
    fieldStates, globalStatus, saveField, debouncedSaveField, cancelPendingSave, retrySave,
    hasPendingChanges: states.some(state => state.status === "saving" || state.status === "error"),
  };
}
