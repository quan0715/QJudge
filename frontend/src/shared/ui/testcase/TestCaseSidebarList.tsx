import React from "react";
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
  list?: string;
  sample: string;
  custom: string;
  emptyCustom: string;
  addAction: string;
  addNewLabel: string;
  addNewTag: string;
}

interface TestCaseSidebarListProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
  groupedCases: TestCaseGroup;
  onAdd?: () => void;
  isAddingNew?: boolean;
  labels?: Partial<TestCaseSidebarListLabels>;
}

const DEFAULT_LABELS: TestCaseSidebarListLabels = {
  list: "Test Cases",
  sample: "Sample Cases",
  custom: "Custom Cases",
  emptyCustom: "No custom cases",
  addAction: "Add test case",
  addNewLabel: "New test case",
  addNewTag: "New",
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
      <div
        key={c.id}
        onClick={() => onSelect(idx)}
        className={`${styles.item} ${isActive ? styles["item--active"] : ""}`}
      >
        {isPublic && <Locked size={16} className={styles.itemIcon} />}
        <span title={c.label} className={styles.itemLabel}>
          {c.label}
        </span>
      </div>
    );
  };

  return (
    <div className={styles.list}>
      {allCases.map((c, idx) => renderCaseItem(c, idx, selectedIndex === idx))}
      
      {onAdd && (
        <div onClick={onAdd} className={styles.addItem}>
          <Add size={16} />
          <span>{resolvedLabels.addAction}</span>
        </div>
      )}
    </div>
  );
};

export default TestCaseSidebarList;
