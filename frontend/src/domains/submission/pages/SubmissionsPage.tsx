import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Pagination,
  Button,
  Dropdown,
  Toggle,
  InlineLoading,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  SkeletonText,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { getSubmissions } from "@/services/submission";
import { SubmissionDetailModal } from "../components/SubmissionDetailModal";
import {
  SubmissionTable,
  type SubmissionRow,
} from "../components/SubmissionTable";
import { PageHeader } from "@/ui/layout/PageHeader";
import { useAuth } from "@/domains/auth/contexts/AuthContext";
import type { Submission } from "@/core/entities/submission.entity";

const SubmissionsPage = () => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("3months");
  const [onlyMine, setOnlyMine] = useState(false);

  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get("submission_id");
  const isModalOpen = !!submissionIdFromUrl;

  const statusOptions = [
    { id: "all", label: t("submissions.allStatus") },
    { id: "AC", label: t("submissions.ac") },
    { id: "WA", label: t("submissions.wa") },
    { id: "TLE", label: t("submissions.tle") },
    { id: "MLE", label: t("submissions.mle") },
    { id: "RE", label: t("submissions.re") },
    { id: "CE", label: t("submissions.ce") },
    { id: "pending", label: t("submissions.pending") },
    { id: "judging", label: t("submissions.judging") },
  ];

  const dateRangeOptions = [
    { id: "1month", label: t("submissions.dateRange1month") },
    { id: "3months", label: t("submissions.dateRange3months") },
    { id: "6months", label: t("submissions.dateRange6months") },
    { id: "all", label: t("submissions.dateRangeAll") },
  ];

  useEffect(() => {
    fetchSubmissions();
  }, [page, pageSize, statusFilter, dateRange, onlyMine, user?.id]);

  const fetchSubmissions = async () => {
    if (!refreshing) setLoading(true);
    try {
      const params: any = {
        page,
        page_size: pageSize,
        is_test: false,
        source_type: "practice", // Default to practice submissions only
      };

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      // Only my submissions filter
      if (onlyMine && user?.id) {
        params.user = user.id;
      }

      // Date range filter (performance optimization)
      if (dateRange === "all") {
        params.include_all = "true";
      } else if (dateRange === "1month") {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        params.created_after = oneMonthAgo.toISOString();
      } else if (dateRange === "6months") {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        params.created_after = sixMonthsAgo.toISOString();
      }
      // Default is 3 months (handled by backend)

      const { results, count } = await getSubmissions(params);

      setSubmissions(results);
      setTotalItems(count);
    } catch (error) {
      console.error("Failed to fetch submissions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubmissions();
  };

  // Check if current user can view submission details
  // Allowed: Admin/Teacher, Submitter (note: Problem Owner check is server-side only)
  const canViewSubmission = (sub: Submission): boolean => {
    if (!user) return false;

    // Admin or Teacher can view all
    if (user.role === "admin" || user.role === "teacher") return true;

    // Submitter can view their own
    if (sub.userId === user.id?.toString()) return true;

    // For Problem Owner - we don't have that info in list view,
    // so we'll let backend 403 handle it (button shown but will fail)
    return false;
  };

  const submissionRows: SubmissionRow[] = submissions.map((sub) => ({
    id: sub.id,
    status: sub.status,
    problem_id: sub.problemId ? parseInt(sub.problemId) : 0,
    problem_title: sub.problemTitle || `Problem #${sub.problemId}`,
    username: sub.username || "Unknown",
    userId: sub.userId,
    language: sub.language,
    score: sub.score || 0,
    exec_time: sub.execTime || 0,
    created_at: sub.createdAt,
    canView: canViewSubmission(sub),
  }));

  const handleViewDetails = (id: string) => {
    setSearchParams({ submission_id: id });
  };

  const handleCloseModal = () => {
    setSearchParams({});
  };

  // Skeleton table headers
  const skeletonHeaders = [
    { key: "status", header: t("submissions.status") },
    { key: "problem", header: t("submissions.problem") },
    { key: "user", header: t("submissions.user") },
    { key: "language", header: t("submissions.language") },
    { key: "time", header: t("submissions.time") },
    { key: "created_at", header: t("submissions.submittedAt") },
  ];

  // Render skeleton loading table
  const renderSkeletonTable = () => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            {skeletonHeaders.map((header) => (
              <TableHeader key={header.key}>{header.header}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 10 }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              {skeletonHeaders.map((header) => (
                <TableCell key={header.key}>
                  <SkeletonText
                    width={header.key === "status" ? "60px" : "80%"}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const isInitialLoading = loading && !refreshing && submissions.length === 0;

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <PageHeader
        title={t("submissions.title")}
        subtitle={t("submissions.subtitle")}
        extra={
          <Button
            kind="tertiary"
            renderIcon={refreshing ? InlineLoading : Renew}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing
              ? t("submissions.refreshing")
              : t("submissions.refresh")}
          </Button>
        }
      />

      <TableToolbar
        style={{
          backgroundColor: "var(--cds-layer-01)",
          borderBottom: "1px solid var(--cds-border-subtle)",
        }}
      >
        <TableToolbarContent
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            padding: "0.5rem 1rem",
          }}
        >
          <TableToolbarSearch
            placeholder={t("submissions.searchPlaceholder")}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            persistent
          />
          <div style={{ minWidth: "160px" }}>
            <Dropdown
              id="status-filter"
              titleText=""
              label={t("submissions.filterStatus")}
              size="sm"
              items={statusOptions}
              itemToString={(item: any) => (item ? item.label : "")}
              selectedItem={statusOptions.find((s) => s.id === statusFilter)}
              onChange={({ selectedItem }: any) => {
                if (selectedItem) {
                  setStatusFilter(selectedItem.id);
                  setPage(1);
                }
              }}
            />
          </div>
          <div style={{ minWidth: "180px" }}>
            <Dropdown
              id="date-range-filter"
              titleText=""
              label={t("submissions.dateRange")}
              size="sm"
              items={dateRangeOptions}
              itemToString={(item: any) => (item ? item.label : "")}
              selectedItem={dateRangeOptions.find((d) => d.id === dateRange)}
              onChange={({ selectedItem }: any) => {
                if (selectedItem) {
                  setDateRange(selectedItem.id);
                  setPage(1);
                }
              }}
            />
          </div>
          {user && (
            <Toggle
              id="only-mine-toggle"
              size="sm"
              labelText=""
              labelA={t("submissions.all")}
              labelB={t("submissions.mine")}
              toggled={onlyMine}
              onToggle={(checked: boolean) => {
                setOnlyMine(checked);
                setPage(1);
              }}
            />
          )}
        </TableToolbarContent>
      </TableToolbar>

      {isInitialLoading ? (
        renderSkeletonTable()
      ) : (
        <SubmissionTable
          submissions={submissionRows}
          onViewDetails={handleViewDetails}
          showProblem={true}
          showUser={true}
          showScore={true}
        />
      )}

      <Pagination
        totalItems={totalItems}
        backwardText={tc("pagination.previous")}
        forwardText={tc("pagination.next")}
        itemsPerPageText={tc("pagination.itemsPerPage")}
        page={page}
        pageSize={pageSize}
        pageSizes={[10, 20, 50, 100]}
        size="md"
        onChange={({ page: newPage, pageSize: newPageSize }: any) => {
          setPage(newPage);
          setPageSize(newPageSize);
        }}
        style={{ marginTop: "1rem" }}
      />

      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default SubmissionsPage;
