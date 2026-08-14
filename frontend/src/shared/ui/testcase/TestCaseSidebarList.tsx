import React from "react";
import { Button } from "@carbon/react";
import { Add, Locked } from "@carbon/icons-react";
import type { TestCaseStatus } from "@/core/entities/submission.entity";
import styles from "./TestCaseSidebarList.module.scss";

export interface TestCaseListItem {
  id: string;
  status?: TestCaseStatus; // Optional in edit mode
  label: string;
  isHidden?: boolean;
}

export interface TestCaseGroup {
  sample: TestCaseListItem[];
  custom: TestCaseListItem[];
}

export interface TestCaseSidebarListLabels {
  addAction: string;
}

interface TestCaseSidebarListProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
  groupedCases: TestCaseGroup;
  onAdd?: () => void;
  labels?: Partial<TestCaseSidebarListLabels>;
}

const DEFAULT_LABELS: TestCaseSidebarListLabels = {
  addAction: "Add test case",
};

export const TestCaseSidebarList: React.FC<TestCaseSidebarListProps> = ({
  selectedIndex,
  onSelect,
  groupedCases,
  onAdd,
  labels,
}) => {
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };
  const { sample, custom } = groupedCases;
  const allCases = [...sample, ...custom];

  const renderCaseItem = (c: TestCaseListItem, idx: number, isActive: boolean) => {
    const isPublic = c.label.toLowerCase().includes("sample") || c.isHidden === false;

    return (
      <Button
        type="button"
        kind="ghost"
        size="sm"
        key={c.id}
        onClick={() => onSelect(idx)}
        className={`${styles.item} ${isActive ? styles["item--active"] : ""}`}
      >
        {isPublic && <Locked size={16} className={styles.itemIcon} />}
        <span title={c.label} className={styles.itemLabel}>
          {c.label}
        </span>
      </Button>
    );
  };

  return (
    <div className={styles.list}>
      {allCases.map((c, idx) => renderCaseItem(c, idx, selectedIndex === idx))}
      
      {onAdd && (
        <Button
          type="button"
          kind="ghost"
          size="sm"
          renderIcon={Add}
          onClick={onAdd}
          className={styles.addItem}
        >
          {resolvedLabels.addAction}
        </Button>
      )}
    </div>
  );
};

export default TestCaseSidebarList;
