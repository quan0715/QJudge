import type { ReactNode } from "react";
import { useDashboardTabs } from "./DashboardTabs";

export interface DashboardTabPanelProps {
  tabId: string;
  children: ReactNode;
}

export function DashboardTabPanel({ tabId, children }: DashboardTabPanelProps) {
  const { activeId } = useDashboardTabs();
  if (activeId !== tabId) return null;
  return <>{children}</>;
}
