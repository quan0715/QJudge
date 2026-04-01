/**
 * SubmissionFilterPopover - Filter popover for submissions
 * Uses shared FilterPopover shell with submission-specific filter fields
 */
import React, { useState } from "react";
import { Checkbox, Dropdown } from "@carbon/react";
import { FilterPopover } from "@/shared/ui/filter/FilterPopover";

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
  filters: FilterState;
  onApplyFilter: (filters: FilterState) => void;
  onResetFilter: () => void;
  showOnlyMine?: boolean;
  className?: string;
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
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  React.useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const hasActiveFilters =
    filters.status !== "all" || filters.dateRange !== "all" || filters.onlyMine;

  const handleReset = () => {
    setLocalFilters({ status: "all", dateRange: "all", onlyMine: false });
    onResetFilter();
  };

  const handleApply = () => {
    onApplyFilter(localFilters);
  };

  return (
    <FilterPopover
      hasActiveFilters={hasActiveFilters}
      triggerLabel="篩選提交記錄"
      onReset={handleReset}
      doneLabel="套用"
      onDone={handleApply}
      align={align}
      className={className}
    >
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
            setLocalFilters((prev) => ({ ...prev, status: selectedItem.id }));
          }
        }}
      />

      <Dropdown
        id="date-range-filter-dropdown"
        titleText="時間範圍"
        label="選擇時間"
        items={[...DATE_RANGE_OPTIONS]}
        itemToString={(item: (typeof DATE_RANGE_OPTIONS)[number] | null) =>
          item ? item.label : ""
        }
        selectedItem={
          DATE_RANGE_OPTIONS.find((d) => d.id === localFilters.dateRange) ||
          DATE_RANGE_OPTIONS[0]
        }
        onChange={({
          selectedItem,
        }: {
          selectedItem: (typeof DATE_RANGE_OPTIONS)[number] | null;
        }) => {
          if (selectedItem) {
            setLocalFilters((prev) => ({ ...prev, dateRange: selectedItem.id }));
          }
        }}
      />

      {showOnlyMine && (
        <Checkbox
          id="only-mine-filter"
          labelText="只顯示我的提交"
          checked={localFilters.onlyMine}
          onChange={(_, { checked }) =>
            setLocalFilters((prev) => ({ ...prev, onlyMine: checked }))
          }
        />
      )}
    </FilterPopover>
  );
};

export default SubmissionFilterPopover;
