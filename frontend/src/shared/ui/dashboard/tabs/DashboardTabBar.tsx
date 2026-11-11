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
  /**
   * Inline padding around the tab strip.
   * - "default" (recommended): adds 1rem inline padding so the tabs
   *   sit a little inset from the block edge.
   * - "flush": no padding; for cases where the bar already sits inside
   *   a container that handles inset itself.
   */
  padding?: "default" | "flush";
}

export function DashboardTabBar({
  tabs,
  toolbar,
  ariaLabel = "dashboard tabs",
  padding = "default",
}: DashboardTabBarProps) {
  const { activeId, onChange } = useDashboardTabs();
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  );
  const rootClass =
    padding === "flush"
      ? styles.root
      : `${styles.root} ${styles.padded}`;
  return (
    <div className={rootClass}>
      <div className={styles.tabs}>
        <Tabs
          selectedIndex={selectedIndex}
          onChange={({ selectedIndex }: { selectedIndex: number }) => {
            const next = tabs[selectedIndex];
            if (next) onChange(next.id);
          }}
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
      </div>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
    </div>
  );
}
