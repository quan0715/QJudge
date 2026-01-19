import React from "react";
import {
  ContainedList,
  ContainedListItem,
  Stack,
} from "@carbon/react";
import { Locked } from "@carbon/icons-react";
import type { TestCaseStatus } from "@/core/entities/submission.entity";
import { SubmissionStatusIcon } from "@/shared/ui/tag";

export interface TestCaseListItem {
  id: string;
  status: TestCaseStatus;
  label: string;
  isHidden?: boolean;
}

export interface TestCaseSidebarListLabels {
  list: string;
}

interface TestCaseResultSidebarListProps {
  cases: TestCaseListItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  labels?: Partial<TestCaseSidebarListLabels>;
}

const DEFAULT_LABELS: TestCaseSidebarListLabels = {
  list: "Test Cases",
};

const getIndicatorColor = (status: TestCaseStatus) => {
  switch (status) {
    case "passed":
      return "var(--cds-support-success)";
    case "failed":
      return "var(--cds-support-error)";
    case "pending":
    default:
      return "var(--cds-support-info)";
  }
};

export const TestCaseResultSidebarList: React.FC<TestCaseResultSidebarListProps> = ({
  cases,
  selectedIndex,
  onSelect,
  labels,
}) => {
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };

  const getIndicatorTop = () => {
    return `calc(var(--test-result-list-header-height) + (var(--test-result-row-height) * ${selectedIndex}))`;
  };

  const currentStatus = cases[selectedIndex]?.status || "pending";
  const indicatorColor = getIndicatorColor(currentStatus);

  const renderCaseItem = (c: TestCaseListItem, idx: number, isActive: boolean) => {
    return (
      <ContainedListItem
        key={c.id}
        className="test-result-panel__case-item"
        data-active={isActive}
        onClick={() => onSelect(idx)}
        renderIcon={() => <SubmissionStatusIcon status={c.status} size={16} />}
      >
        <Stack
          orientation="horizontal"
          gap={0}
          className="test-result-panel__case-item-content"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <span className="test-result-panel__case-label" title={c.label}>
            {c.label}
          </span>
          {c.isHidden && (
            <Locked size={16} fill="var(--cds-text-secondary)" />
          )}
        </Stack>
      </ContainedListItem>
    );
  };

  return (
    <Stack orientation="vertical" gap={0} className="test-result-panel__sidebar">
      {cases.length > 0 && (
        <div
          className="test-result-panel__sliding-indicator"
          style={{
            top: getIndicatorTop(),
            backgroundColor: indicatorColor,
          }}
        />
      )}

      <ContainedList label={resolvedLabels.list} kind="on-page" isInset>
        {cases.map((c, idx) => renderCaseItem(c, idx, selectedIndex === idx))}
      </ContainedList>
    </Stack>
  );
};

export default TestCaseResultSidebarList;
