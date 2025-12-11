import React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Pagination,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  SkeletonText,
} from "@carbon/react";
import {
  SubmissionTable,
  type SubmissionRow,
  type StatusFilterType,
} from "@/domains/submission/components/SubmissionTable";
import { SubmissionDetailModal } from "@/domains/submission/components/SubmissionDetailModal";
import {
  useProblemSubmissions,
  useProblem,
} from "@/domains/problem/hooks/useProblem";

/**
 * Problem Submission History Component
 * Uses ProblemProvider context for data fetching via useQuery
 */
const ProblemSubmissionHistory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { contestId } = useProblem();

  // Get submissions data from context
  const {
    submissions,
    count: totalItems,
    loading,
    params,
    setParams,
    refetch,
  } = useProblemSubmissions();

  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get("submission_id");
  const isModalOpen = !!submissionIdFromUrl;

  // Map submissions to SubmissionRow format
  const submissionRows: SubmissionRow[] = submissions.map((sub) => ({
    id: sub.id.toString(),
    status: sub.status,
    username: sub.username,
    language: sub.language,
    score: sub.score ?? 0,
    exec_time: sub.execTime ?? 0,
    created_at: sub.createdAt,
  }));

  // Skeleton loading headers
  const skeletonHeaders = [
    { key: "id", header: "ID" },
    { key: "status", header: "狀態" },
    { key: "language", header: "語言" },
    { key: "score", header: "得分" },
    { key: "time", header: "時間" },
    { key: "created_at", header: "提交時間" },
  ];

  if (loading && submissions.length === 0) {
    return (
      <div>
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
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {skeletonHeaders.map((header) => (
                    <TableCell key={header.key}>
                      <SkeletonText
                        width={header.key === "status" ? "50px" : "80%"}
                      />
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

  const handleRefresh = () => {
    refetch();
  };

  const handleStatusFilterChange = (status: StatusFilterType) => {
    setParams({ statusFilter: status });
  };

  const handleOnlyMineChange = (value: boolean) => {
    setParams({ onlyMine: value });
  };

  const handlePageChange = ({
    page: newPage,
    pageSize: newPageSize,
  }: {
    page: number;
    pageSize: number;
  }) => {
    setParams({ page: newPage, pageSize: newPageSize });
  };

  return (
    <div>
      <SubmissionTable
        submissions={submissionRows}
        onViewDetails={(id) => setSearchParams({ submission_id: id })}
        showProblem={false}
        showUser={false}
        showScore={true}
        // Enable built-in toolbar
        showToolbar={true}
        statusFilter={(params.statusFilter as StatusFilterType) || "all"}
        onStatusFilterChange={handleStatusFilterChange}
        onlyMine={params.onlyMine}
        onOnlyMineChange={handleOnlyMineChange}
        onRefresh={handleRefresh}
        isRefreshing={loading}
      />

      {/* Pagination */}
      <Pagination
        totalItems={totalItems}
        backwardText="上一頁"
        forwardText="下一頁"
        itemsPerPageText="每頁顯示"
        page={params.page}
        pageSize={params.pageSize}
        pageSizes={[10, 20, 50]}
        size="md"
        onChange={handlePageChange}
      />

      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={() => setSearchParams({})}
        contestId={contestId}
      />
    </div>
  );
};

export default ProblemSubmissionHistory;
