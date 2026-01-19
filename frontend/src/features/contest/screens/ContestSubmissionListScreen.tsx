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
  Pagination,
  Button,
  Dropdown,
  Toggle,
  InlineLoading,
  SkeletonText,
} from "@carbon/react";
import { View, Renew } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { SubmissionDetailModal } from "@/features/submissions/components";
import { SubmissionStatusBadge } from "@/shared/ui/tag";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import ContainerCard from "@/shared/layout/ContainerCard";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useContestSubmissions } from "@/features/contest/hooks/useContestSubmissions";

interface ContestSubmissionListPageProps {
  maxWidth?: string;
}

// CSS keyframes for flip animation
const flipAnimationStyles = `
  @keyframes flipIn {
    0% {
      transform: perspective(400px) rotateX(-90deg);
      opacity: 0;
    }
    40% {
      transform: perspective(400px) rotateX(10deg);
    }
    70% {
      transform: perspective(400px) rotateX(-5deg);
    }
    100% {
      transform: perspective(400px) rotateX(0deg);
      opacity: 1;
    }
  }
`;

const ContestSubmissionListPage: React.FC<ContestSubmissionListPageProps> = ({
  maxWidth,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [problemFilter, setProblemFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [animationKey, setAnimationKey] = useState(0);

  // Get contest problems from context
  const { contest } = useContest();
  const problems = contest?.problems || [];

  // Use React Query hook for fetching submissions
  const { data, isLoading, isFetching, refetch } = useContestSubmissions({
    contestId: contestId || "",
    page,
    pageSize,
    statusFilter,
    problemFilter,
    userId: onlyMine && currentUser?.id ? currentUser.id : undefined,
  });

  const submissions = data?.results || [];
  const totalItems = data?.count || 0;

  // Inject flip animation styles
  useEffect(() => {
    const existingStyle = document.getElementById("flip-animation-styles");
    if (!existingStyle) {
      const styleEl = document.createElement("style");
      styleEl.id = "flip-animation-styles";
      styleEl.textContent = flipAnimationStyles;
      document.head.appendChild(styleEl);
    }
  }, []);

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

  // Trigger animation when data changes
  useEffect(() => {
    if (data) {
      setAnimationKey((prev) => prev + 1);
    }
  }, [data]);

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

  const handleRefresh = () => {
    refetch();
  };

  const getStatusBadge = (status: string) => {
    return <SubmissionStatusBadge status={status} size="sm" />;
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
    { key: "status", header: t("submissions.status") },
    { key: "problem", header: t("submissions.problem") },
    { key: "username", header: t("submissions.user") },
    { key: "language", header: t("submissions.language") },
    { key: "score", header: t("submissions.score") },
    { key: "time", header: t("submissions.time") },
    { key: "created_at", header: t("submissions.submittedAt") },
    { key: "actions", header: t("submissions.actions") },
  ];

  const rows = submissions.map((sub: any) => {
    const isOwner = sub.username === currentUser?.username;
    const isAdminOrTeacher =
      currentUser?.role === "admin" || currentUser?.role === "teacher";
    const canView = isOwner || isAdminOrTeacher;

    // Find problem info from contest problems list
    const problemInfo = problems.find((p) => p.problemId === sub.problemId);
    const displayTitle =
      sub.problemTitle || problemInfo?.title || `Problem ${sub.problemId}`;
    const displayLabel = problemInfo?.label || "";

    return {
      id: sub.id.toString(),
      status: getStatusBadge(sub.status),
      problem: (
        <span style={{ fontWeight: 500 }}>
          {displayLabel ? `${displayLabel}. ${displayTitle}` : displayTitle}
        </span>
      ),
      username: sub.username || "Unknown",
      language: getLanguageLabel(sub.language),
      score: sub.score ?? 0,
      time: sub.execTime !== undefined ? `${sub.execTime} ms` : "-",
      created_at: sub.createdAt ? formatDate(sub.createdAt) : "-",
      actions: (
        <Button
          kind="ghost"
          size="sm"
          renderIcon={View}
          iconDescription={
            canView
              ? t("submissions.viewDetails")
              : t("submissions.noPermission")
          }
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
      canView,
    };
  });

  // Show initial loading state
  const showSkeleton = isLoading && submissions.length === 0;

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          {/* Left Column: Filters */}
          <div className="cds--col-lg-4 cds--col-md-8">
            <ContainerCard
              title={t("submissions.filters")}
              style={{ marginBottom: "1rem" }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                }}
              >
                <Dropdown
                  id="problem-filter"
                  titleText={t("submissions.problemLabel")}
                  label={t("submissions.selectProblem")}
                  items={[
                    { id: "all", label: t("submissions.allProblems") },
                    ...problems.map((p) => ({
                      id: p.problemId,
                      label: `${p.label}. ${p.title}`,
                    })),
                  ]}
                  itemToString={(item: any) => (item ? item.label : "")}
                  selectedItem={
                    problemFilter === "all"
                      ? { id: "all", label: t("submissions.allProblems") }
                      : {
                          id: problemFilter,
                          label: `${
                            problems.find((p) => p.problemId === problemFilter)
                              ?.label || ""
                          }. ${
                            problems.find((p) => p.problemId === problemFilter)
                              ?.title || ""
                          }`,
                        }
                  }
                  onChange={({ selectedItem }: any) => {
                    if (selectedItem) {
                      setProblemFilter(selectedItem.id);
                      setPage(1);
                    }
                  }}
                />

                <Dropdown
                  id="status-filter"
                  titleText={t("submissions.statusLabel")}
                  label={t("submissions.selectStatus")}
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

                {currentUser && (
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--cds-text-secondary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {t("submissions.submitter")}
                    </div>
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
                  </div>
                )}

                <Button
                  kind="tertiary"
                  renderIcon={isFetching ? InlineLoading : Renew}
                  onClick={handleRefresh}
                  disabled={isFetching}
                  size="md"
                  style={{ width: "100%" }}
                >
                  {isFetching
                    ? t("submissions.refreshing")
                    : t("submissions.refresh")}
                </Button>
              </div>
            </ContainerCard>
          </div>

          {/* Right Column: Table */}
          <div className="cds--col-lg-12 cds--col-md-8">
            <ContainerCard
              title={
                showSkeleton
                  ? t("submissions.title")
                  : t("submissions.titleWithCount", { count: totalItems })
              }
              noPadding
            >
              <div style={{ minHeight: "200px" }}>
                {showSkeleton ? (
                  // Skeleton loading table for initial load
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
                                  width={
                                    header.key === "status" ? "50px" : "80%"
                                  }
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
                            {rows.map((row: any, rowIndex: number) => {
                              const { key, ...rowProps } = getRowProps({ row });
                              return (
                                <TableRow
                                  {...rowProps}
                                  key={`${key}-${animationKey}`}
                                  onClick={() => {
                                    if (row.canView) {
                                      handleSubmissionClick(row.id);
                                    }
                                  }}
                                  style={{
                                    cursor: row.canView ? "pointer" : "default",
                                    animation: "flipIn 0.5s ease-out forwards",
                                    animationDelay: `${rowIndex * 50}ms`,
                                    opacity: 0,
                                    transformOrigin: "center top",
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
              </div>

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
