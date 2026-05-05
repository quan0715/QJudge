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
) {
  const ctx = useContext(ContestRuntimeNavigatorContext);
  const setNavigator = ctx?.setNavigator;

  useEffect(() => {
    if (!setNavigator) return;
    setNavigator(state);
  }, [setNavigator, state]);

  useEffect(() => {
    if (!setNavigator) return;
    return () => setNavigator(null);
  }, [setNavigator]);
}
