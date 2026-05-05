import {
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ContestRuntimeNavigatorContext,
  type ContestRuntimeNavigatorState,
} from "./contestRuntimeNavigatorStore";

export function ContestRuntimeNavigatorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [navigator, setNavigator] =
    useState<ContestRuntimeNavigatorState | null>(null);
  const value = useMemo(
    () => ({ navigator, setNavigator }),
    [navigator],
  );

  return (
    <ContestRuntimeNavigatorContext.Provider value={value}>
      {children}
    </ContestRuntimeNavigatorContext.Provider>
  );
}
