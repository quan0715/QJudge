import React from "react";
import { Tabs, Tab, TabList } from "@carbon/react";
import "./StickyTabs.scss";

interface TabItem {
  label: string;
  key: string;
}

interface StickyTabsProps {
  items: TabItem[];
  selectedIndex: number;
  onChange: (index: number) => void;
  ariaLabel?: string;
  /** Max width for content alignment. undefined = 100% */
  maxWidth?: string;
  /**
   * Whether to apply sticky positioning.
   * Set to false when a parent container handles sticky positioning.
   * Default: true
   */
  sticky?: boolean;
  /** Top offset for sticky positioning (e.g., '3rem' for navbar height). Default: '3rem' */
  stickyTop?: string;
}

/**
 * Reusable Carbon tabs with optional sticky positioning.
 */
export const StickyTabs: React.FC<StickyTabsProps> = ({
  items,
  selectedIndex,
  onChange,
  ariaLabel = "Navigation tabs",
  maxWidth = "1056px",
  sticky = true,
  stickyTop = "3rem",
}) => {
  const containerClasses = [
    "sticky-tabs-container",
    sticky && "sticky-tabs-container--sticky",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={containerClasses}
      style={sticky ? { top: stickyTop } : undefined}
    >
      <div
        className="sticky-tabs-inner"
        style={{
          maxWidth: maxWidth,
          margin: maxWidth ? "0 auto" : undefined,
        }}
      >
        <Tabs
          selectedIndex={selectedIndex}
          onChange={({ selectedIndex }: { selectedIndex: number }) =>
            onChange(selectedIndex)
          }
        >
          <TabList aria-label={ariaLabel}>
            {items.map((item) => (
              <Tab key={item.key}>{item.label}</Tab>
            ))}
          </TabList>
        </Tabs>
      </div>
    </div>
  );
};

export default StickyTabs;
