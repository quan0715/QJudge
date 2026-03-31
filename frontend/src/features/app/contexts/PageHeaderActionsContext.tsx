import { createContext, useState, useContext, type ReactNode } from "react";

type HeaderActions = ReactNode;
type SetHeaderActions = (actions: HeaderActions) => void;

const PageHeaderActionsReadContext = createContext<HeaderActions>(null);
const PageHeaderActionsWriteContext = createContext<SetHeaderActions>(() => {});

export const PageHeaderActionsProvider = ({ children }: { children: ReactNode }) => {
  const [actions, setActions] = useState<HeaderActions>(null);
  return (
    <PageHeaderActionsWriteContext.Provider value={setActions}>
      <PageHeaderActionsReadContext.Provider value={actions}>
        {children}
      </PageHeaderActionsReadContext.Provider>
    </PageHeaderActionsWriteContext.Provider>
  );
};

/** Used by GlobalHeader to RENDER injected actions */
export const usePageHeaderActionsSlot = () => useContext(PageHeaderActionsReadContext);

/** Used by pages to INJECT actions into GlobalHeader */
export const usePageHeaderActions = () => useContext(PageHeaderActionsWriteContext);
