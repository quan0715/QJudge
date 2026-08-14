import { useCallback, useSyncExternalStore } from "react";
import { useCopilotStateContext } from "../react/copilotContexts";

export interface UseCopilotSessionLocationResult {
  id: string | null;
  set(id: string | null, options?: { replace?: boolean }): void;
}

export function useCopilotSessionLocation(): UseCopilotSessionLocationResult {
  const { sessionLocation } = useCopilotStateContext();
  const subscribe = useCallback(
    (notify: () => void) =>
      sessionLocation?.subscribe(() => notify()) ?? (() => {}),
    [sessionLocation],
  );
  const getSnapshot = useCallback(
    () => sessionLocation?.get() ?? null,
    [sessionLocation],
  );
  const id = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback(
    (next: string | null, options?: { replace?: boolean }) => {
      sessionLocation?.set(next, options);
    },
    [sessionLocation],
  );
  return { id, set };
}
