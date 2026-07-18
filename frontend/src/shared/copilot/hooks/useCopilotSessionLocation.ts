import { useCallback, useEffect, useState } from "react";
import { useCopilotStateContext } from "../react/copilotContexts";

export interface UseCopilotSessionLocationResult {
  id: string | null;
  set(id: string | null, options?: { replace?: boolean }): void;
}

export function useCopilotSessionLocation(): UseCopilotSessionLocationResult {
  const { sessionLocation } = useCopilotStateContext();
  const [id, setId] = useState(() => sessionLocation?.get() ?? null);
  useEffect(() => {
    setId(sessionLocation?.get() ?? null);
    return sessionLocation?.subscribe(setId);
  }, [sessionLocation]);
  const set = useCallback(
    (next: string | null, options?: { replace?: boolean }) => {
      sessionLocation?.set(next, options);
      setId(next);
    },
    [sessionLocation],
  );
  return { id, set };
}
