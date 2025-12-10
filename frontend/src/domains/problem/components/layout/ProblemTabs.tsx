import React from "react";
import { StickyTabs } from "@/ui/components/StickyTabs";

interface ProblemTabsProps {
  selectedIndex: number;
  onChange: (index: number) => void;
  isAdmin?: boolean;
  maxWidth?: string;
  /**
   * Top offset for sticky positioning.
   * Use '0' when inside ContentPage scroll container (contest mode).
   * Use '3rem' when using whole page scroll (standalone mode).
   */
  stickyTop?: string;
}

const ProblemTabs: React.FC<ProblemTabsProps> = ({
  selectedIndex,
  onChange,
  isAdmin,
  maxWidth,
  stickyTop = "3rem",
}) => {
  const tabs = [
    { label: "題目", key: "description" },
    { label: "解題與提交", key: "solver" },
    { label: "提交記錄", key: "history" },
    { label: "解題統計", key: "stats" },
  ];

  if (isAdmin) {
    tabs.push({ label: "設定題目", key: "settings" });
  }

  return (
    <StickyTabs
      items={tabs}
      selectedIndex={selectedIndex}
      onChange={onChange}
      ariaLabel="Problem navigation"
      maxWidth={maxWidth}
      stickyTop={stickyTop}
    />
  );
};

export default ProblemTabs;
