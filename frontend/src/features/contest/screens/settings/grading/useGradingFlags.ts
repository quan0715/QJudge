import { useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";

const STORAGE_KEY_PREFIX = "qjudge:grading-flags:";

export function useGradingFlags() {
  const { contestId } = useParams<{ contestId: string }>();
  const storageKey = `${STORAGE_KEY_PREFIX}${contestId ?? ""}`;

  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      if (flaggedIds.size > 0) {
        localStorage.setItem(storageKey, JSON.stringify([...flaggedIds]));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage full or unavailable
    }
  }, [flaggedIds, storageKey]);

  const toggleFlag = useCallback((answerId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(answerId)) {
        next.delete(answerId);
      } else {
        next.add(answerId);
      }
      return next;
    });
  }, []);

  const isFlagged = useCallback(
    (answerId: string) => flaggedIds.has(answerId),
    [flaggedIds]
  );

  return { flaggedIds, toggleFlag, isFlagged };
}
