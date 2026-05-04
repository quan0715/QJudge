import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, TabPanels, Tabs, Tile } from "@carbon/react";
import styles from "./AdminSegmentedDashboard.module.scss";

export interface AdminSegmentedDashboardTab {
  key: string;
  label: string;
  content: ReactNode;
}

interface AdminSegmentedDashboardProps {
  ariaLabel: string;
  header?: ReactNode;
  primary: ReactNode;
  side: ReactNode;
  tabs?: AdminSegmentedDashboardTab[];
}

export default function AdminSegmentedDashboard({
  ariaLabel,
  header,
  primary,
  side,
  tabs,
}: AdminSegmentedDashboardProps) {
  return (
    <section className={styles.root} aria-label={ariaLabel}>
      {header ? <div className={styles.headerRow}>{header}</div> : null}
      <div className={styles.topGrid}>
        <Tile className={styles.primaryPanel}>{primary}</Tile>
        <Tile className={styles.sidePanel}>{side}</Tile>
      </div>
      {tabs && tabs.length > 0 ? (
        <div className={styles.tabsPanel}>
          <Tabs>
            <TabList aria-label={`${ariaLabel} 分頁`}>
              {tabs.map((tab) => (
                <Tab key={tab.key}>{tab.label}</Tab>
              ))}
            </TabList>
            <TabPanels>
              {tabs.map((tab) => (
                <TabPanel key={tab.key} className={styles.tabPanel}>
                  {tab.content}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        </div>
      ) : null}
    </section>
  );
}
