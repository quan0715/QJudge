import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Pagination,
  Button,
  Dropdown,
  InlineLoading,
  DataTable,
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

  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get("submission_id");
  const isModalOpen = !!submissionIdFromUrl;

  const statusOptions = [
    { id: "all", label: "全部狀態" },
    { id: "AC", label: "通過 (AC)" },
    { id: "WA", label: "答案錯誤 (WA)" },
    { id: "TLE", label: "超時 (TLE)" },
    { id: "MLE", label: "記憶體超限 (MLE)" },
    { id: "RE", label: "執行錯誤 (RE)" },
    { id: "CE", label: "編譯錯誤 (CE)" },
    { id: "pending", label: "等待中" },
    { id: "judging", label: "評測中" },
  ];

  useEffect(() => {
    fetchSubmissions();
  }, [page, pageSize, statusFilter]);

  const fetchSubmissions = async () => {
    if (!refreshing) setLoading(true);
    try {
      const params: any = { page, page_size: pageSize, is_test: false };
      if (statusFilter !== "all") {
        params.status = statusFilter;
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
    { key: "status", header: "狀態" },
    { key: "problem", header: "題目" },
    { key: "user", header: "用戶" },
    { key: "language", header: "語言" },
    { key: "time", header: "耗時" },
    { key: "created_at", header: "提交時間" },
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
        title="提交記錄"
        subtitle="查看所有公開的程式碼提交狀態與結果。"
        extra={
          <Button
            kind="tertiary"
            renderIcon={refreshing ? InlineLoading : Renew}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "更新中..." : "重新整理"}
          </Button>
        }
      />

      <TableToolbar>
        <TableToolbarContent>
          <TableToolbarSearch
            placeholder="搜尋用戶或題目..."
            onChange={(e: any) => setSearchQuery(e.target.value)}
            persistent
          />
          <div style={{ width: "200px" }}>
            <Dropdown
              id="status-filter"
              titleText=""
              label="篩選狀態"
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
        backwardText="上一頁"
        forwardText="下一頁"
        itemsPerPageText="每頁顯示"
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
