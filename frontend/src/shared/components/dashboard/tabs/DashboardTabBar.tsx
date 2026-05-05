import type { ReactNode } from "react";
import { Tab, TabList, Tabs } from "@carbon/react";
import { useDashboardTabs } from "./DashboardTabs";
import styles from "./DashboardTabBar.module.scss";

export interface TabDef {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
}

export interface DashboardTabBarProps {
  tabs: TabDef[];
  toolbar?: ReactNode;
  ariaLabel?: string;
}

export function DashboardTabBar({
  tabs,
  toolbar,
  ariaLabel = "dashboard tabs",
}: DashboardTabBarProps) {
  const { activeId, onChange } = useDashboardTabs();
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  );
  return (
    <div className={styles.root}>
      <Tabs
        selectedIndex={selectedIndex}
        onChange={({ selectedIndex }: { selectedIndex: number }) => {
          const next = tabs[selectedIndex];
          if (next) onChange(next.id);
        }}
        className={styles.tabs}
      >
        <TabList aria-label={ariaLabel}>
          {tabs.map((t) => (
            <Tab key={t.id}>
              {t.label}
              {t.badge !== undefined && <> ({t.badge})</>}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
    </div>
  );
}
