import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import { SubmissionDetailModal } from "@/features/submissions/components";
import {
  SubmissionDataTable,
  type FilterState,
  type DateRangeFilterType,
} from "@/shared/ui/submission";
import { PageHeader } from "@/shared/layout/PageHeader";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import type { Submission } from "@/core/entities/submission.entity";
import type { GetSubmissionsParams } from "@/core/ports/submission.repository";
import "./screen.scss";

/**
 * Map FilterState dateRange to API date parameters
 */
const getDateRangeParams = (dateRange: DateRangeFilterType): string | null => {
  const now = new Date();
  switch (dateRange) {
    case "1day": {
      const oneDayAgo = new Date(now);
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      return oneDayAgo.toISOString();
    }
    case "1week": {
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      return oneWeekAgo.toISOString();
    }
    case "1month": {
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      return oneMonthAgo.toISOString();
    }
    case "3months": {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return threeMonthsAgo.toISOString();
    }
    case "all":
    default:
      return null;
  }
};

const SubmissionsScreen = () => {
  const { t } = useTranslation("contest");
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalItems, setTotalItems] = useState(0);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filter state (unified)
  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    dateRange: "3months", // Default to 3 months
    onlyMine: false,
  });

  // Modal state from URL
  const submissionIdFromUrl = searchParams.get("submission_id");
  const isModalOpen = !!submissionIdFromUrl;

  // Fetch submissions
  const fetchSubmissions = useCallback(async () => {
    if (!refreshing) setLoading(true);
    try {
      const params: GetSubmissionsParams = {
        page,
        page_size: pageSize,
        is_test: 0,
        source_type: "practice",
      };

      // Status filter
      if (filters.status !== "all") {
        params.status = filters.status;
      }

      // Only my submissions
      if (filters.onlyMine && user?.id) {
        params.user = String(user.id);
      }

      // Date range filter
      if (filters.dateRange === "all") {
        params.include_all = "true";
      } else {
        const createdAfter = getDateRangeParams(filters.dateRange);
        if (createdAfter) {
          params.created_after = createdAfter;
        }
      }

      const { results, count } = await getSubmissions(params);
      setSubmissions(results);
      setTotalItems(count);
    } catch (error) {
      console.error("Failed to fetch submissions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, filters, user?.id, refreshing]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Handlers
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleRowClick = useCallback(
    (submissionId: string) => {
      setSearchParams({ submission_id: submissionId });
    },
    [setSearchParams]
  );

  const handleCloseModal = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const handlePageChange = useCallback((newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
  }, []);

  const handleFilterApply = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilters({
      status: "all",
      dateRange: "3months",
      onlyMine: false,
    });
    setPage(1);
  }, []);

  return (
    <div className="submissions-page">
      <PageHeader
        title={t("submissions.title")}
        subtitle={t("submissions.subtitle")}
      />

      <SubmissionDataTable
        submissions={submissions}
        loading={loading}
        totalItems={totalItems}
        page={page}
        pageSize={pageSize}
        pageSizes={[10, 20, 50, 100]}
        // Column visibility
        showProblem={true}
        showUser={true}
        showScore={true}
        showMemory={false}
        // Toolbar & Filters
        showToolbar={true}
        filters={filters}
        showOnlyMineToggle={!!user}
        showSearch={true}
        // Event handlers
        onRowClick={handleRowClick}
        onPageChange={handlePageChange}
        onFilterApply={handleFilterApply}
        onFilterReset={handleFilterReset}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
        // Empty state
        emptyTitle={t("submissions.empty")}
        emptySubtitle={t("submissions.emptySubtitle")}
      />

      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default SubmissionsScreen;
