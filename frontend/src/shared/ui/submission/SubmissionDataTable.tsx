import React, { useMemo, useState, useCallback } from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Button,
  Pagination,
  SkeletonText,
} from "@carbon/react";
import { Time, DataBase, Renew } from "@carbon/icons-react";
import { getStatusConfig } from "@/core/config/status.config";
import { formatSmartTime, getLanguageLabel } from "@/shared/utils/format";
import type {
  Submission,
  SubmissionStatus,
} from "@/core/entities/submission.entity";
import SubmissionFilterPopover, {
  type FilterState,
  type StatusFilterType,
  type DateRangeFilterType,
} from "./SubmissionFilterPopover";
import "./SubmissionDataTable.scss";

// Re-export filter types for consumers
export type { FilterState, StatusFilterType, DateRangeFilterType };
export { STATUS_OPTIONS, DATE_RANGE_OPTIONS } from "./SubmissionFilterPopover";

// ============================================================================
// Props Interface
// ============================================================================

export interface SubmissionDataTableProps {
  /** Submission data */
  submissions: Submission[];
  /** Loading state */
  loading?: boolean;
  /** Total items for pagination */
  totalItems?: number;
  /** Current page */
  page?: number;
  /** Page size */
  pageSize?: number;
  /** Available page sizes */
  pageSizes?: number[];

  // Column visibility
  /** Show problem column */
  showProblem?: boolean;
  /** Show user column */
  showUser?: boolean;
  /** Show score column */
  showScore?: boolean;
  /** Show memory column */
  showMemory?: boolean;

  // Toolbar & Filters
  /** Show toolbar with filters */
  showToolbar?: boolean;
  /** Current filter state */
  filters?: FilterState;
  /** Show "only mine" toggle (requires user to be logged in) */
  showOnlyMineToggle?: boolean;
  /** Show search input */
  showSearch?: boolean;

  // Event handlers
  /** Row click handler */
  onRowClick?: (submissionId: string) => void;
  /** Page change handler */
  onPageChange?: (page: number, pageSize: number) => void;
  /** Filter apply handler */
  onFilterApply?: (filters: FilterState) => void;
  /** Filter reset handler */
  onFilterReset?: () => void;
  /** Search handler */
  onSearch?: (query: string) => void;
  /** Refresh handler */
  onRefresh?: () => void;
  /** Is currently refreshing */
  isRefreshing?: boolean;

  // Empty state
  /** Empty state title */
  emptyTitle?: string;
  /** Empty state subtitle */
  emptySubtitle?: string;
}

// Default filter state
const DEFAULT_FILTERS: FilterState = {
  status: "all",
  dateRange: "all",
  onlyMine: false,
};

// ============================================================================
// Component
// ============================================================================

/**
 * SubmissionDataTable - A shared DataTable for displaying submissions
 *
 * Features:
 * - Configurable columns (problem, user, score, memory)
 * - Built-in toolbar with filter popover
 * - Pagination
 * - Loading and empty states
 * - Uses shared utility functions for formatting
 */
export const SubmissionDataTable: React.FC<SubmissionDataTableProps> = ({
  submissions,
  loading = false,
  totalItems = 0,
  page = 1,
  pageSize = 10,
  pageSizes = [10, 20, 50],
  // Column visibility
  showProblem = true,
  showUser = true,
  showScore = true,
  showMemory = true,
  // Toolbar
  showToolbar = true,
  filters = DEFAULT_FILTERS,
  showOnlyMineToggle = true,
  showSearch = false,
  // Event handlers
  onRowClick,
  onPageChange,
  onFilterApply,
  onFilterReset,
  onSearch,
  onRefresh,
  isRefreshing = false,
  // Empty state
  emptyTitle = "尚無繳交記錄",
  emptySubtitle = "開始解題後，您的繳交記錄將會顯示在這裡",
}) => {
  // Local search state
  const [searchQuery, setSearchQuery] = useState("");

  // Handle search input change
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement> | "", value?: string) => {
      const searchValue = value ?? (typeof event === "string" ? event : event.target.value);
      setSearchQuery(searchValue);
      onSearch?.(searchValue);
    },
    [onSearch]
  );

  // Build headers dynamically
  const headers = useMemo(() => {
    const h: { key: string; header: string }[] = [
      { key: "status", header: "狀態" },
    ];

    if (showProblem) {
      h.push({ key: "problem", header: "題目" });
    }

    if (showUser) {
      h.push({ key: "user", header: "用戶" });
    }

    h.push({ key: "language", header: "語言" });

    if (showScore) {
      h.push({ key: "score", header: "分數" });
    }

    h.push({ key: "execTime", header: "執行時間" });

    if (showMemory) {
      h.push({ key: "memory", header: "記憶體" });
    }

    h.push({ key: "createdAt", header: "提交時間" });

    return h;
  }, [showProblem, showUser, showScore, showMemory]);

  // Build table rows
  const rows = useMemo(() => {
    return submissions.map((submission) => {
      const statusConfig = getStatusConfig(
        submission.status as SubmissionStatus
      );

      const row: { id: string } & Record<string, React.ReactNode> = {
        id: submission.id,
        status: (
          <Tag type={statusConfig.type} size="sm">
            {submission.status}
          </Tag>
        ),
        language: (
          <Tag type="cool-gray" size="sm">
            {getLanguageLabel(submission.language)}
          </Tag>
        ),
        execTime:
          submission.execTime !== undefined ? (
            <span className="submission-data-table__metric">
              <Time size={14} />
              {submission.execTime} ms
            </span>
          ) : (
            "-"
          ),
        createdAt: formatSmartTime(submission.createdAt),
      };

      if (showProblem) {
        row.problem = (
          <span className="submission-data-table__problem">
            {submission.problemTitle || submission.problemId}
          </span>
        );
      }

      if (showUser) {
        row.user = (
          <span className="submission-data-table__user">
            {submission.username || submission.userId}
          </span>
        );
      }

      if (showScore) {
        row.score =
          submission.score !== undefined ? `${submission.score}` : "-";
      }

      if (showMemory) {
        row.memory =
          submission.memoryUsage !== undefined ? (
            <span className="submission-data-table__metric">
              <DataBase size={14} />
              {Math.round(submission.memoryUsage / 1024)} MB
            </span>
          ) : (
            "-"
          );
      }

      return row;
    });
  }, [submissions, showProblem, showUser, showScore, showMemory]);

  // Handle page change
  const handlePageChange = ({
    page: newPage,
    pageSize: newPageSize,
  }: {
    page: number;
    pageSize: number;
  }) => {
    onPageChange?.(newPage, newPageSize);
  };

  // Handle filter apply
  const handleFilterApply = (newFilters: FilterState) => {
    onFilterApply?.(newFilters);
  };

  // Handle filter reset
  const handleFilterReset = () => {
    onFilterReset?.();
  };

  // Loading state - skeleton table
  if (loading && submissions.length === 0) {
    return (
      <div className="submission-data-table submission-data-table--loading">
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {headers.map((h) => (
                  <TableHeader key={h.key}>{h.header}</TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {headers.map((h) => (
                    <TableCell key={h.key}>
                      <SkeletonText width="80%" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    );
  }

  // Check if empty (used for empty state row)
  const isEmpty = !loading && submissions.length === 0;

  return (
    <div className="submission-data-table">
      <DataTable rows={rows} headers={headers}>
        {({
          rows: tableRows,
          headers: tableHeaders,
          getTableProps,
          getHeaderProps,
          getRowProps,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }: any) => (
          <TableContainer>
            {/* Toolbar - following Carbon DataTable pattern */}
            {showToolbar && (
              <TableToolbar aria-label="提交記錄工具列">
                <TableToolbarContent>
                  {/* Search */}
                  {showSearch && (
                    <TableToolbarSearch
                      onChange={handleSearchChange}
                      value={searchQuery}
                      placeholder="搜尋..."
                      persistent
                    />
                  )}

                  {/* Filter Popover */}
                  {onFilterApply && (
                    <SubmissionFilterPopover
                      filters={filters}
                      onApplyFilter={handleFilterApply}
                      onResetFilter={handleFilterReset}
                      showOnlyMine={showOnlyMineToggle}
                    />
                  )}

                  {/* Refresh Button */}
                  {onRefresh && (
                    <Button
                      kind="primary"
                      renderIcon={Renew}
                      onClick={onRefresh}
                      disabled={isRefreshing}
                      iconDescription="重新整理"
                    >
                      {isRefreshing ? "更新中..." : "重新整理"}
                    </Button>
                  )}
                </TableToolbarContent>
              </TableToolbar>
            )}

            {/* Table */}
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((header: any) => {
                    const { key, ...headerProps } = getHeaderProps({ header });
                    return (
                      <TableHeader key={key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {isEmpty ? (
                  <TableRow>
                    <TableCell colSpan={headers.length}>
                      <div className="submission-data-table__empty-message">
                        <span className="submission-data-table__empty-title">
                          {emptyTitle}
                        </span>
                        <span className="submission-data-table__empty-subtitle">
                          {emptySubtitle}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((row: any) => {
                    const { key, ...rowProps } = getRowProps({ row });
                    return (
                      <TableRow
                        key={key}
                        {...rowProps}
                        onClick={() => onRowClick?.(row.id)}
                        className={`submission-data-table__row ${
                          onRowClick
                            ? "submission-data-table__row--clickable"
                            : ""
                        }`}
                      >
                        {row.cells.map((cell: any) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      {/* Pagination */}
      {totalItems > 0 && onPageChange && (
        <div className="submission-data-table__pagination">
          <Pagination
            totalItems={totalItems}
            backwardText="上一頁"
            forwardText="下一頁"
            itemsPerPageText="每頁顯示"
            page={page}
            pageSize={pageSize}
            pageSizes={pageSizes}
            size="md"
            onChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
};

export default SubmissionDataTable;
