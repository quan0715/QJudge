import { useContext, useEffect } from "react";

import {
  ContestRuntimeNavigatorContext,
  type ContestRuntimeNavigatorState,
} from "./contestRuntimeNavigatorStore";

export function useContestRuntimeNavigator() {
  return useContext(ContestRuntimeNavigatorContext)?.navigator ?? null;
}

export function useRegisterContestRuntimeNavigator(
  state: ContestRuntimeNavigatorState | null,
  enabled = true,
) {
  const ctx = useContext(ContestRuntimeNavigatorContext);
  const setNavigator = ctx?.setNavigator;

  useEffect(() => {
    if (!setNavigator || !enabled) return;
    setNavigator(state);
  }, [setNavigator, state, enabled]);

  useEffect(() => {
    if (!setNavigator || !enabled) return;
    return () => setNavigator(null);
  }, [setNavigator, enabled]);
}
