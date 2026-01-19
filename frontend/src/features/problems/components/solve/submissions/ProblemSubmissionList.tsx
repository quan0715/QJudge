import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { SubmissionDataTable, type FilterState } from "@/shared/ui/submission";
import { SubmissionDetailModal } from "@/features/submissions/components";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import type { Submission } from "@/core/entities/submission.entity";

interface ProblemSubmissionListProps {
  /** Problem ID to fetch submissions for */
  problemId: string;
  /** Optional contest ID */
  contestId?: string;
  /** Show toolbar with filters (default: true) */
  showToolbar?: boolean;
  /** Show problem column (default: true) */
  showProblem?: boolean;
}

// Default filter state
const DEFAULT_FILTERS: FilterState = {
  status: "all",
  dateRange: "all",
  onlyMine: false,
};

/**
 * ProblemSubmissionList - Displays a list of submissions for a problem
 *
 * Uses the shared SubmissionDataTable component with:
 * - Filter popover (status, date range, only mine)
 * - Pagination
 * - Click to view details in modal
 */
export const ProblemSubmissionList: React.FC<ProblemSubmissionListProps> = ({
  problemId,
  contestId,
  showToolbar = true,
  showProblem = true,
}) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filters
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Fetch submissions
  const fetchSubmissions = useCallback(async (options?: { showLoading?: boolean }) => {
    if (!problemId) return;

    const showLoading = options?.showLoading ?? true;
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const params: Record<string, any> = {
        problem: problemId,
        page,
        page_size: pageSize,
      };

      if (contestId) {
        params.contest = contestId;
      }

      // Status filter
      if (filters.status !== "all") {
        params.status = filters.status;
      }

      // Only my submissions
      if (filters.onlyMine && user?.id) {
        params.user = user.id;
      }

      // Date range filter
      const now = new Date();
      switch (filters.dateRange) {
        case "1day": {
          const oneDayAgo = new Date(now);
          oneDayAgo.setDate(oneDayAgo.getDate() - 1);
          params.created_after = oneDayAgo.toISOString();
          break;
        }
        case "1week": {
          const oneWeekAgo = new Date(now);
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          params.created_after = oneWeekAgo.toISOString();
          break;
        }
        case "1month": {
          const oneMonthAgo = new Date(now);
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          params.created_after = oneMonthAgo.toISOString();
          break;
        }
        case "3months": {
          const threeMonthsAgo = new Date(now);
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          params.created_after = threeMonthsAgo.toISOString();
          break;
        }
        case "all": {
          // No date filter
          break;
        }
      }

      const response = await getSubmissions(params);
      setSubmissions(response.results || []);
      setTotalItems(response.count || 0);
    } catch (error) {
      console.error("Failed to fetch submissions:", error);
      setSubmissions([]);
      setTotalItems(0);
    } finally {
      if (showLoading) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [problemId, contestId, page, pageSize, filters, user?.id]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // URL-based modal state
  const submissionIdFromUrl = searchParams.get("submission_id");
  const isModalOpen = !!submissionIdFromUrl;

  // Handlers
  const handleRowClick = (submissionId: string) => {
    setSearchParams({ submission_id: submissionId });
  };

  const handleModalClose = () => {
    setSearchParams({});
  };

  const handlePageChange = (newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
  };

  const handleFilterApply = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const handleFilterReset = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handleRefresh = () => {
    fetchSubmissions({ showLoading: false });
  };

  return (
    <>
      <SubmissionDataTable
        submissions={submissions}
        loading={loading}
        totalItems={totalItems}
        page={page}
        pageSize={pageSize}
        pageSizes={[10, 20, 50]}
        // Column visibility
        showProblem={showProblem}
        showUser={true}
        showScore={true}
        showMemory={false}
        // Toolbar & Filters
        showToolbar={showToolbar}
        filters={filters}
        showOnlyMineToggle={!!user}
        // Event handlers
        onRowClick={handleRowClick}
        onPageChange={handlePageChange}
        onFilterApply={handleFilterApply}
        onFilterReset={handleFilterReset}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
        // Empty state
        emptyTitle="尚無繳交記錄"
        emptySubtitle="開始解題後，您的繳交記錄將會顯示在這裡"
      />

      {/* Submission Detail Modal */}
      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        contestId={contestId}
      />
    </>
  );
};

export default ProblemSubmissionList;
