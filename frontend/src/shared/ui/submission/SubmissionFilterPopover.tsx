/**
 * SubmissionFilterPopover - Filter popover for submissions
 * Following Carbon Design System TableToolbarFilter pattern
 */
import React, { useState, useId } from "react";
import {
  Popover,
  PopoverContent,
  Button,
  Checkbox,
  Dropdown,
  Layer,
} from "@carbon/react";
import { Filter } from "@carbon/icons-react";
import cx from "classnames";

import "./SubmissionFilterPopover.scss";

// Status options for filtering
export const STATUS_OPTIONS = [
  { id: "all", label: "全部狀態" },
  { id: "AC", label: "Accepted" },
  { id: "WA", label: "Wrong Answer" },
  { id: "TLE", label: "Time Limit Exceeded" },
  { id: "MLE", label: "Memory Limit Exceeded" },
  { id: "RE", label: "Runtime Error" },
  { id: "CE", label: "Compilation Error" },
  { id: "pending", label: "評測中" },
] as const;

// Date range options
export const DATE_RANGE_OPTIONS = [
  { id: "all", label: "全部時間" },
  { id: "1day", label: "過去 24 小時" },
  { id: "1week", label: "過去一週" },
  { id: "1month", label: "過去一個月" },
  { id: "3months", label: "過去三個月" },
] as const;

export type StatusFilterType = (typeof STATUS_OPTIONS)[number]["id"];
export type DateRangeFilterType = (typeof DATE_RANGE_OPTIONS)[number]["id"];

export interface FilterState {
  status: StatusFilterType;
  dateRange: DateRangeFilterType;
  onlyMine: boolean;
}

export interface SubmissionFilterPopoverProps {
  /** Current filter state */
  filters: FilterState;
  /** Callback when filters are applied */
  onApplyFilter: (filters: FilterState) => void;
  /** Callback when filters are reset */
  onResetFilter: () => void;
  /** Whether to show "only mine" option */
  showOnlyMine?: boolean;
  /** Custom className */
  className?: string;
  /** Popover alignment */
  align?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
}

const SubmissionFilterPopover: React.FC<SubmissionFilterPopoverProps> = ({
  filters,
  onApplyFilter,
  onResetFilter,
  showOnlyMine = true,
  className,
  align = "bottom-right",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const filterId = useId();

  // Local state for pending filter changes
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  // Sync local state when filters prop changes
  React.useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleApplyFilter = () => {
    setIsOpen(false);
    onApplyFilter(localFilters);
  };

  const handleResetFilter = () => {
    const resetFilters: FilterState = {
      status: "all",
      dateRange: "all",
      onlyMine: false,
    };
    setLocalFilters(resetFilters);
    setIsOpen(false);
    onResetFilter();
  };

  const handleOnlyMineChange = (checked: boolean) => {
    setLocalFilters((prev) => ({
      ...prev,
      onlyMine: checked,
    }));
  };

  // Check if any filter is active
  const hasActiveFilters =
    filters.status !== "all" || filters.dateRange !== "all" || filters.onlyMine;

  const toolbarActionClasses = cx(
    className,
    "cds--toolbar-action",
    "cds--overflow-menu",
    {
      "submission-filter-popover--active": hasActiveFilters,
    }
  );

  return (
    <Layer>
      <Popover
        open={isOpen}
        isTabTip
        onRequestClose={() => setIsOpen(false)}
        align={align}
      >
        <button
          aria-label="篩選提交記錄"
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className={toolbarActionClasses}
        >
          <Filter />
        </button>
        <PopoverContent id={filterId}>
          <div className="submission-filter-popover__content">
            {/* Filter Fields */}
            <div className="submission-filter-popover__fields">
              {/* Status Filter - Dropdown */}
              <Dropdown
                id="status-filter-dropdown"
                titleText="狀態"
                label="選擇狀態"
                items={[...STATUS_OPTIONS]}
                itemToString={(item: (typeof STATUS_OPTIONS)[number] | null) =>
                  item ? item.label : ""
                }
                selectedItem={
                  STATUS_OPTIONS.find((s) => s.id === localFilters.status) ||
                  STATUS_OPTIONS[0]
                }
                onChange={({
                  selectedItem,
                }: {
                  selectedItem: (typeof STATUS_OPTIONS)[number] | null;
                }) => {
                  if (selectedItem) {
                    setLocalFilters((prev) => ({
                      ...prev,
                      status: selectedItem.id,
                    }));
                  }
                }}
              />

              {/* Date Range Filter - Dropdown */}
              <Dropdown
                id="date-range-filter-dropdown"
                titleText="時間範圍"
                label="選擇時間"
                items={[...DATE_RANGE_OPTIONS]}
                itemToString={(
                  item: (typeof DATE_RANGE_OPTIONS)[number] | null
                ) => (item ? item.label : "")}
                selectedItem={
                  DATE_RANGE_OPTIONS.find(
                    (d) => d.id === localFilters.dateRange
                  ) || DATE_RANGE_OPTIONS[0]
                }
                onChange={({
                  selectedItem,
                }: {
                  selectedItem: (typeof DATE_RANGE_OPTIONS)[number] | null;
                }) => {
                  if (selectedItem) {
                    setLocalFilters((prev) => ({
                      ...prev,
                      dateRange: selectedItem.id,
                    }));
                  }
                }}
              />

              {/* Only Mine Checkbox */}
              {showOnlyMine && (
                <div className="submission-filter-popover__checkbox">
                  <Checkbox
                    id="only-mine-filter"
                    labelText="只顯示我的提交"
                    checked={localFilters.onlyMine}
                    onChange={(_, { checked }) => handleOnlyMineChange(checked)}
                  />
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="submission-filter-popover__actions">
              <Button kind="secondary" onClick={handleResetFilter}>
                重設
              </Button>
              <Button kind="primary" onClick={handleApplyFilter}>
                套用
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Layer>
  );
};

export default SubmissionFilterPopover;
