import { createContext, useContext, type ReactNode } from "react";

interface Ctx {
  activeId: string;
  onChange: (id: string) => void;
}
const TabsCtx = createContext<Ctx | null>(null);

export interface DashboardTabsProps {
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
}

export function DashboardTabs({
  activeId,
  onChange,
  children,
}: DashboardTabsProps) {
  return (
    <TabsCtx.Provider value={{ activeId, onChange }}>
      {children}
    </TabsCtx.Provider>
  );
}

export function useDashboardTabs(): Ctx {
  const ctx = useContext(TabsCtx);
  if (!ctx) {
    throw new Error("DashboardTabs context missing");
  }
  return ctx;
}
