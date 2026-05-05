import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

interface ContestRuntimeContextValue {
  isRuntime: boolean;
}

const ContestRuntimeContext = createContext<ContestRuntimeContextValue>({
  isRuntime: false,
});

export const ContestRuntimeProvider = ({
  value,
  children,
}: {
  value: ContestRuntimeContextValue;
  children: ReactNode;
}) => (
  <ContestRuntimeContext.Provider value={value}>
    {children}
  </ContestRuntimeContext.Provider>
);

export const useContestRuntimeContext = () => useContext(ContestRuntimeContext);
