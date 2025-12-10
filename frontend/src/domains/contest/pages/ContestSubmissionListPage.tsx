import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbarSearch,
  Pagination,
  Button,
  Dropdown,
  InlineLoading,
  SkeletonText,
} from "@carbon/react";
import { View, Renew } from "@carbon/icons-react";
import { getSubmissions } from "@/services/submission";
import { SubmissionDetailModal } from "@/domains/submission/components/SubmissionDetailModal";
import { StatusBadge } from "@/ui/components/StatusBadge";
import type { StatusType } from "@/ui/components/StatusBadge";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";
import ContainerCard from "@/ui/components/layout/ContainerCard";

interface Submission {
  id: number;
  userId: string;
  username: string; // Flattened by mapper
  problemId: string;
  problemTitle: string;
  language: string;
  status: string;
  score: number;
  execTime: number;
  createdAt: string;
}

interface ContestSubmissionListPageProps {
  maxWidth?: string;
}

const ContestSubmissionListPage: React.FC<ContestSubmissionListPageProps> = ({
  maxWidth,
}) => {
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error("Failed to parse user", e);
      }
    }
  }, []);

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
    if (contestId) {
      fetchSubmissions();
    }
  }, [contestId, page, pageSize, statusFilter]);

  const fetchSubmissions = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const params: any = {
        source_type: "contest",
        contest: contestId,
        page: page,
        page_size: pageSize,
      };

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      const data: any = await getSubmissions(params);

      if (Array.isArray(data)) {
        setSubmissions(data); // data is Submission[] (mapped)
        setTotalItems(data.length);
      } else {
        setSubmissions(data.results);
        setTotalItems(data.count);
      }
    } catch (error) {
      console.error("Failed to fetch submissions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchSubmissions(true);
  };

  const getStatusBadge = (status: string) => {
    let type: StatusType = "gray";
    let label = status;

    switch (status) {
      case "AC":
        type = "success";
        label = "AC";
        break;
      case "WA":
        type = "error";
        label = "WA";
        break;
      case "TLE":
        type = "purple";
        label = "TLE";
        break;
      case "MLE":
        type = "purple";
        label = "MLE";
        break;
      case "RE":
        type = "error";
        label = "RE";
        break;
      case "CE":
        type = "warning";
        label = "CE";
        break;
      case "pending":
        type = "gray";
        label = "Pending";
        break;
      case "judging":
        type = "info";
        label = "Judging";
        break;
      case "SE":
        type = "error";
        label = "SE";
        break;
      default:
        type = "gray";
        label = status;
    }

    return <StatusBadge status={type} text={label} size="sm" />;
  };

  const getLanguageLabel = (lang: string) => {
    const langMap: Record<string, string> = {
      cpp: "C++",
      python: "Python",
      java: "Java",
      javascript: "JavaScript",
      c: "C",
    };
    return langMap[lang] || lang;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const handleSubmissionClick = (submissionId: string) => {
    setSearchParams((prev) => {
      prev.set("submission_id", submissionId);
      return prev;
    });
  };

  const handleCloseModal = () => {
    setSearchParams((prev) => {
      prev.delete("submission_id");
      return prev;
    });
  };

  const headers = [
    { key: "status", header: "狀態" },
    { key: "problem", header: "題目" },
    { key: "username", header: "用戶" },
    { key: "language", header: "語言" },
    { key: "score", header: "得分" },
    { key: "time", header: "耗時" },
    { key: "created_at", header: "提交時間" },
    { key: "actions", header: "操作" },
  ];

  const rows = submissions.map((sub: any) => {
    const isOwner = sub.username === currentUser?.username;
    const isAdminOrTeacher =
      currentUser?.role === "admin" || currentUser?.role === "teacher";
    const canView = isOwner || isAdminOrTeacher;

    return {
      id: sub.id.toString(),
      status: getStatusBadge(sub.status),
      problem: (
        <span style={{ fontWeight: 500 }}>
          {sub.problemTitle || `Problem ${sub.problemId}`}
        </span>
      ),
      username: sub.username || "Unknown", // Flattened by mapper
      language: getLanguageLabel(sub.language),
      score: sub.score ?? 0,
      time: sub.execTime !== undefined ? `${sub.execTime} ms` : "-",
      created_at: sub.createdAt ? formatDate(sub.createdAt) : "-",
      actions: (
        <Button
          kind="ghost"
          size="sm"
          renderIcon={View}
          iconDescription={canView ? "查看詳情" : "無權限查看"}
          hasIconOnly
          disabled={!canView}
          onClick={(e) => {
            e.stopPropagation();
            if (canView) {
              handleSubmissionClick(sub.id.toString());
            }
          }}
        />
      ),
      canView, // Pass to row for click handling
    };
  });

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          {/* Left Column: Filters */}
          <div className="cds--col-lg-4 cds--col-md-8">
            <ContainerCard title="篩選條件" style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                }}
              >
                <TableToolbarSearch
                  placeholder="搜尋用戶或題目..."
                  onChange={(e: any) => setSearchQuery(e.target.value)}
                  persistent
                  size="lg"
                />

                <Dropdown
                  id="status-filter"
                  titleText="狀態"
                  label="選擇狀態"
                  items={statusOptions}
                  itemToString={(item: any) => (item ? item.label : "")}
                  selectedItem={
                    statusOptions.find((s) => s.id === statusFilter) || null
                  }
                  onChange={({ selectedItem }: any) => {
                    if (selectedItem) {
                      setStatusFilter(selectedItem.id);
                      setPage(1);
                    }
                  }}
                />

                <Button
                  kind="tertiary"
                  renderIcon={refreshing ? InlineLoading : Renew}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  size="md"
                  style={{ width: "100%" }}
                >
                  {refreshing ? "更新中..." : "重新整理"}
                </Button>
              </div>
            </ContainerCard>
          </div>

          {/* Right Column: Table */}
          <div className="cds--col-lg-12 cds--col-md-8">
            <ContainerCard
              title={loading ? "提交記錄" : `提交記錄 (${totalItems})`}
              noPadding
            >
              {loading && submissions.length === 0 ? (
                // Skeleton loading table
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHeader key={header.key}>
                            {header.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Array.from({ length: 10 }).map((_, index) => (
                        <TableRow key={`skeleton-${index}`}>
                          {headers.map((header) => (
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
              ) : (
                <DataTable rows={rows} headers={headers}>
                  {({
                    rows,
                    headers,
                    getTableProps,
                    getHeaderProps,
                    getRowProps,
                  }: any) => (
                    <TableContainer
                      title=""
                      description=""
                      style={{
                        backgroundColor: "transparent",
                        padding: "0",
                        boxShadow: "none",
                      }}
                    >
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header: any) => {
                              const { key, ...headerProps } = getHeaderProps({
                                header,
                              });
                              return (
                                <TableHeader {...headerProps} key={key}>
                                  {header.header}
                                </TableHeader>
                              );
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row: any) => {
                            const { key, ...rowProps } = getRowProps({ row });
                            return (
                              <TableRow
                                {...rowProps}
                                key={key}
                                onClick={() => {
                                  if (row.canView) {
                                    handleSubmissionClick(row.id);
                                  }
                                }}
                                style={{
                                  cursor: row.canView ? "pointer" : "default",
                                }}
                              >
                                {row.cells.map((cell: any) => (
                                  <TableCell key={cell.id}>
                                    {cell.value}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
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
                style={{ borderTop: "1px solid var(--cds-border-subtle)" }}
              />
            </ContainerCard>
          </div>
        </div>
      </div>

      <SubmissionDetailModal
        submissionId={searchParams.get("submission_id")}
        isOpen={!!searchParams.get("submission_id")}
        onClose={handleCloseModal}
        contestId={contestId}
      />
    </SurfaceSection>
  );
};

export default ContestSubmissionListPage;
