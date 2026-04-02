import { useCallback, useEffect, useRef, useState } from "react";

export type ToolbarSaveStatus = "idle" | "saving" | "saved" | "error";

interface UseToolbarSaveStatusOptions {
  savedVisibleMs?: number;
}

interface UseToolbarSaveStatusReturn {
  status: ToolbarSaveStatus;
  track: <T>(operation: () => Promise<T>) => Promise<T>;
  markSaving: () => void;
  markSaved: () => void;
  markError: () => void;
  reset: () => void;
}

/**
 * Tracks aggregate async save-like operations for top-level toolbar feedback.
 * - Any in-flight operation => saving
 * - Any failed operation => error
 * - All operations settled successfully => saved (auto resets to idle)
 */
export function useToolbarSaveStatus(
  options: UseToolbarSaveStatusOptions = {}
): UseToolbarSaveStatusReturn {
  const { savedVisibleMs = 2000 } = options;
  const [status, setStatus] = useState<ToolbarSaveStatus>("idle");
  const pendingCountRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearIdleTimer();
  }, [clearIdleTimer]);

  const markSaving = useCallback(() => {
    pendingCountRef.current += 1;
    clearIdleTimer();
    setStatus("saving");
  }, [clearIdleTimer]);

  const markSaved = useCallback(() => {
    pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
    if (pendingCountRef.current > 0) {
      setStatus("saving");
      return;
    }

    setStatus("saved");
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      setStatus("idle");
      idleTimerRef.current = null;
    }, savedVisibleMs);
  }, [clearIdleTimer, savedVisibleMs]);

  const markError = useCallback(() => {
    pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
    clearIdleTimer();
    setStatus("error");
  }, [clearIdleTimer]);

  const track = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      markSaving();
      try {
        const result = await operation();
        markSaved();
        return result;
      } catch (error) {
        markError();
        throw error;
      }
    },
    [markError, markSaved, markSaving]
  );

  const reset = useCallback(() => {
    pendingCountRef.current = 0;
    clearIdleTimer();
    setStatus("idle");
  }, [clearIdleTimer]);

  return {
    status,
    track,
    markSaving,
    markSaved,
    markError,
    reset,
  };
}

export default useToolbarSaveStatus;
