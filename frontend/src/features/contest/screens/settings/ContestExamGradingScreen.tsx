import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loading,
  Button,
  Layer,
  Popover,
  PopoverContent,
  FluidSearch,
  FluidDropdown,
  Toggle,
} from "@carbon/react";
import { Catalog, DocumentExport, Filter, UserMultiple } from "@carbon/icons-react";
import {
  GradingByQuestionTabScreen,
  GradingByStudentTabScreen,
  GradingMatrixViewScreen,
  useGradingData,
  useGradingFlags,
} from "./grading";
import type { GradingFilter } from "./grading";
import { useTranslation } from "react-i18next";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useAdminPanelRefresh } from "@/features/contest/contexts";
import { EmptyState } from "@/shared/ui/EmptyState";
import ContestScoreboard from "@/features/contest/components/ContestScoreboard";
import {
  IconModeSwitcher,
  type IconModeOption,
} from "@/shared/ui/navigation";
import styles from "./grading/ContestExamGrading.module.scss";

type GradingViewMode = "byQuestion" | "byStudent" | "matrix";
type GlobalFilterOption = { id: GradingFilter; label: string };

const isValidViewMode = (value: string): value is GradingViewMode =>
  value === "byQuestion" || value === "byStudent" || value === "matrix";

const isValidFilter = (value: string): value is GradingFilter =>
  value === "all" || value === "graded" || value === "ungraded";

const ContestExamGradingScreen: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const { contest, scoreboardData, standingsLoading, refreshContest, refreshStandings } = useContest();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const [selectionRequest, setSelectionRequest] = useState<{
    questionId: string;
    studentId: string;
    nonce: number;
  } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const initialStandingsRequestedRef = useRef(false);
  const { t } = useTranslation("contest");
  const rawViewMode = searchParams.get("grading_view") || "byQuestion";
  const viewMode: GradingViewMode = isValidViewMode(rawViewMode)
    ? rawViewMode
    : "byQuestion";
  const searchQuery = searchParams.get("grading_search") || "";
  const rawFilter = searchParams.get("grading_filter") || "all";
  const filter: GradingFilter = isValidFilter(rawFilter) ? rawFilter : "all";
  const selectedQuestionId = searchParams.get("grading_question");
  const selectedStudentId = searchParams.get("grading_student");
  const studentsOnly = searchParams.get("grading_students_only") === "1";
  const isCodingContest = contest?.contestType === "coding";

  const updateGradingParams = useCallback((updates: Record<string, string | null>) => {
    startTransition(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        let hasChanges = false;

        Object.entries(updates).forEach(([key, value]) => {
          const current = next.get(key);
          if (!value) {
            if (current !== null) {
              next.delete(key);
              hasChanges = true;
            }
            return;
          }
          if (current !== value) {
            next.set(key, value);
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      }, { replace: true });
    });
  }, [setSearchParams, startTransition]);

  const published = !!contest?.resultsPublished;
  const publishStateLabel = published
    ? t("grading.published", "已發布")
    : t("grading.unpublished", "未發布");

  const {
    answers,
    answersByQuestion,
    answersByStudent,
    questionProgress,
    students,
    gradeAnswer,
    ungradeAnswer,
    refreshData,
    loading,
  } = useGradingData();

  const { flaggedIds, toggleFlag } = useGradingFlags();

  // Filter to only student-role participants when toggle is active
  const studentOnlyIds = useMemo(() => {
    if (!studentsOnly) return null;
    return new Set(
      students
        .filter((s) => !s.accountRole || s.accountRole === "student")
        .map((s) => s.studentId),
    );
  }, [studentsOnly, students]);

  const filteredStudents = useMemo(
    () => (studentOnlyIds ? students.filter((s) => studentOnlyIds.has(s.studentId)) : students),
    [students, studentOnlyIds],
  );

  const filteredAnswers = useMemo(
    () => (studentOnlyIds ? answers.filter((a) => studentOnlyIds.has(a.studentId)) : answers),
    [answers, studentOnlyIds],
  );

  const filteredAnswersByQuestion = useMemo(() => {
    if (!studentOnlyIds) return answersByQuestion;
    const map = new Map<string, typeof answers>();
    for (const [qId, rows] of answersByQuestion) {
      map.set(qId, rows.filter((a) => studentOnlyIds.has(a.studentId)));
    }
    return map;
  }, [answersByQuestion, studentOnlyIds]);

  const filteredAnswersByStudent = useMemo(() => {
    if (!studentOnlyIds) return answersByStudent;
    const map = new Map<string, typeof answers>();
    for (const [sId, rows] of answersByStudent) {
      if (studentOnlyIds.has(sId)) map.set(sId, rows);
    }
    return map;
  }, [answersByStudent, studentOnlyIds]);
  const ungradedCount = useMemo(
    () => filteredAnswers.filter((row) => row.score === null).length,
    [filteredAnswers],
  );
  const gradedCount = useMemo(
    () => filteredAnswers.length - ungradedCount,
    [filteredAnswers.length, ungradedCount],
  );
  const gradingProgress = useMemo(
    () => `${Math.round((gradedCount / Math.max(filteredAnswers.length, 1)) * 100)}%`,
    [gradedCount, filteredAnswers.length],
  );
  const hasActiveFilters = searchQuery.trim().length > 0 || filter !== "all" || studentsOnly;
  const filterOptions = useMemo<GlobalFilterOption[]>(
    () => [
      { id: "all" as const, label: t("grading.filterAll", "全部") },
      { id: "graded" as const, label: t("grading.filterGraded", "已批改") },
      { id: "ungraded" as const, label: t("grading.filterUngraded", "未批改") },
    ],
    [t],
  );
  const viewModeOptions = useMemo<IconModeOption<GradingViewMode>[]>(
    () => [
      {
        value: "byQuestion",
        label: isCodingContest
          ? t("grading.byQuestionResults", "按題目作答結果")
          : t("grading.byQuestion", "按題目批改"),
        icon: DocumentExport,
      },
      {
        value: "byStudent",
        label: isCodingContest
          ? t("grading.byStudentResults", "按學生作答結果")
          : t("grading.byStudent", "按學生批改"),
        icon: UserMultiple,
      },
      {
        value: "matrix",
        label: isCodingContest
          ? t("grading.leaderboardOverview", "排行榜")
          : t("grading.matrixOverview", "矩陣總覽"),
        icon: Catalog,
      },
    ],
    [isCodingContest, t],
  );

  const handleViewChange = (nextMode: GradingViewMode) => {
    setFilterOpen(false);
    updateGradingParams({
      grading_view: nextMode === "byQuestion" ? null : nextMode,
      grading_search: null,
      grading_filter: null,
    });
  };

  const handleSelectMatrixCell = (questionId: string, studentId: string) => {
    setSelectionRequest({ questionId, studentId, nonce: Date.now() });
    updateGradingParams({
      grading_view: null,
      grading_question: questionId,
      grading_student: studentId,
    });
  };

  useEffect(() => {
    return registerPanelRefresh("grading", async () => {
      await Promise.all([refreshData(), refreshContest(), isCodingContest ? refreshStandings() : Promise.resolve()]);
    });
  }, [isCodingContest, refreshContest, refreshData, refreshStandings, registerPanelRefresh]);

  useEffect(() => {
    if (!isCodingContest) return;
    if (scoreboardData) return;
    if (initialStandingsRequestedRef.current) return;
    initialStandingsRequestedRef.current = true;
    void refreshStandings();
  }, [isCodingContest, refreshStandings, scoreboardData]);

  useEffect(() => {
    if (!isCodingContest || viewMode !== "matrix") return;
    if (scoreboardData || standingsLoading) return;
    void refreshStandings();
  }, [isCodingContest, refreshStandings, scoreboardData, standingsLoading, viewMode]);

  if (loading) {
    return (
      <div className={styles.editorLoading}>
        <Loading withOverlay={false} description={t("grading.loading", "載入批改資料...")} />
      </div>
    );
  }

  if (answers.length === 0) {
    return (
      <EmptyState
        title={t("grading.noAnswers", "尚無作答資料")}
        description={isCodingContest
          ? t("grading.noAnswersDescCoding", "目前還沒有學生提交程式碼，請確認考試已開始且學生已送出 submission。")
          : t("grading.noAnswersDesc", "目前還沒有學生提交作答，請確認考試已開始且學生已完成作答後再進入批改。")}
      />
    );
  }

  return (
    <div className={styles.editorRoot}>
      <div className={styles.globalToolbar}>
        <div className={styles.toolbarGroup}>
          <IconModeSwitcher
            value={viewMode}
            options={viewModeOptions}
            onChange={handleViewChange}
            ariaLabel={isCodingContest ? t("grading.viewModeResults", "作答結果檢視模式") : t("grading.viewMode", "批改模式")}
            className={styles.modeSwitcher}
            tooltipPosition="bottom"
          />
          <div className={styles.globalMeta}>
            {isCodingContest
              ? t("grading.globalSummaryResults", "題目 {{questions}} 題 · 學生 {{students}} 人 · 最後提交 {{total}} 筆 · {{status}}", {
                  questions: questionProgress.length,
                  students: filteredStudents.length,
                  total: filteredAnswers.length,
                  status: publishStateLabel,
                })
              : t("grading.globalSummary", "題目 {{questions}} 題 · 學生 {{students}} 人 · 批改進度 {{graded}}/{{total}} ({{progress}}) · {{status}}", {
                  questions: questionProgress.length,
                  students: filteredStudents.length,
                  graded: gradedCount,
                  total: filteredAnswers.length,
                  progress: gradingProgress,
                  status: publishStateLabel,
                })}
          </div>

          {viewMode !== "matrix" ? (
            <Layer>
              <Popover
                open={filterOpen}
                align="bottom-left"
                isTabTip
                onRequestClose={() => setFilterOpen(false)}
              >
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={Filter}
                  iconDescription={t("grading.filter", "篩選")}
                  data-testid="grading-global-filter-btn"
                  onClick={() => setFilterOpen((prev) => !prev)}
                  className={hasActiveFilters ? styles.globalFilterActive : undefined}
                />
                <PopoverContent className={styles.globalFilterPopoverContent}>
                  <div className={styles.globalFilterPopoverFields}>
                    <FluidSearch
                      id="grading-global-search"
                      labelText={t("grading.searchStudent", "搜尋學生")}
                      placeholder={`${t("grading.searchStudent", "搜尋學生")}...`}
                      value={searchQuery}
                      onChange={(event) =>
                        updateGradingParams({ grading_search: event.target.value || null })
                      }
                    />
                    {viewMode === "byQuestion" && !isCodingContest ? (
                      <FluidDropdown
                        id="grading-global-filter"
                        titleText={t("grading.filter", "篩選")}
                        label={t("grading.filter", "篩選")}
                        items={filterOptions}
                        itemToString={(item) => (item as GlobalFilterOption | null)?.label ?? ""}
                        selectedItem={filterOptions.find((option) => option.id === filter) ?? filterOptions[0]}
                        onChange={({ selectedItem }) =>
                          updateGradingParams({
                            grading_filter:
                              (selectedItem as GlobalFilterOption | null)?.id &&
                              (selectedItem as GlobalFilterOption | null)?.id !== "all"
                                ? (selectedItem as GlobalFilterOption).id
                                : null,
                          })
                        }
                      />
                    ) : null}
                    <Toggle
                      id="grading-students-only"
                      labelText={t("grading.studentsOnly", "只顯示學生")}
                      labelA={t("grading.studentsOnlyOff", "全部角色")}
                      labelB={t("grading.studentsOnlyOn", "僅學生")}
                      toggled={studentsOnly}
                      onToggle={(checked) =>
                        updateGradingParams({ grading_students_only: checked ? "1" : null })
                      }
                      size="sm"
                    />
                  </div>
                  <div className={styles.globalFilterPopoverActions}>
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() =>
                        updateGradingParams({
                          grading_search: null,
                          grading_filter: null,
                        })
                      }
                    >
                      {t("common.reset", "重設")}
                    </Button>
                    <Button kind="primary" size="sm" onClick={() => setFilterOpen(false)}>
                      {t("common.done", "完成")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </Layer>
          ) : null}
        </div>

        <div className={styles.toolbarSpacer} />
      </div>

      {/* Editor body */}
      <div className={styles.editorBody}>
        <div key={viewMode} className={styles.viewTransition}>
          {viewMode === "byQuestion" ? (
            <GradingByQuestionTabScreen
              questionProgress={questionProgress}
              answersByQuestion={filteredAnswersByQuestion}
              students={filteredStudents}
              onGrade={gradeAnswer}
              onUngrade={isCodingContest ? undefined : ungradeAnswer}
              flaggedIds={flaggedIds}
              onToggleFlag={toggleFlag}
              searchQuery={searchQuery}
              filter={isCodingContest ? "all" : filter}
              selectedQuestionId={selectedQuestionId}
              onSelectedQuestionIdChange={(questionId) =>
                updateGradingParams({ grading_question: questionId })
              }
              selectedStudentId={selectedStudentId}
              onSelectedStudentIdChange={(studentId) =>
                updateGradingParams({ grading_student: studentId })
              }
              selectionRequest={selectionRequest}
              readOnly={isCodingContest}
              onRefreshData={refreshData}
            />
          ) : viewMode === "byStudent" ? (
            <GradingByStudentTabScreen
              answersByStudent={filteredAnswersByStudent}
              questionProgress={questionProgress}
              students={filteredStudents}
              onGrade={gradeAnswer}
              onUngrade={isCodingContest ? undefined : ungradeAnswer}
              flaggedIds={flaggedIds}
              onToggleFlag={toggleFlag}
              searchQuery={searchQuery}
              selectedStudentId={selectedStudentId}
              onSelectedStudentIdChange={(studentId) =>
                updateGradingParams({ grading_student: studentId })
              }
              readOnly={isCodingContest}
            />
          ) : (
            isCodingContest ? (
              standingsLoading && !scoreboardData ? (
                <div className={styles.editorLoading}>
                  <Loading
                    withOverlay={false}
                    description={t("grading.loading", "載入批改資料...")}
                  />
                </div>
              ) : scoreboardData ? (
                <ContestScoreboard
                  problems={scoreboardData.problems.map((problem) => ({
                    id: problem.id,
                    title: problem.title || problem.label,
                    order: problem.order,
                    label: problem.label,
                    score: problem.score,
                  }))}
                  standings={scoreboardData.rows.map((row) => ({
                    rank: row.rank,
                    user: {
                      id: Number(row.userId),
                      username: row.displayName,
                    },
                    displayName: row.displayName,
                    solved: row.solvedCount,
                    total_score: row.totalScore,
                    time: row.penalty,
                    problems: Object.fromEntries(
                      Object.entries(row.problems || {}).map(([problemId, stats]) => [
                        problemId,
                        {
                          status:
                            stats.status === "AC"
                              ? "AC"
                              : stats.status === "WA" || stats.status === "TLE" || stats.status === "MLE" || stats.status === "RE" || stats.status === "CE" || stats.status === "SE" || stats.status === "KR" || stats.status === "NS"
                                ? "WA"
                                : null,
                          score: stats.score ?? 0,
                          tries: stats.tries ?? 0,
                          time: stats.time ?? 0,
                          pending: !!stats.pending,
                        },
                      ]),
                    ),
                  }))}
                  loading={standingsLoading}
                />
              ) : (
                <EmptyState
                  title={t("grading.leaderboardEmpty", "排行榜尚無資料")}
                  description={t("grading.leaderboardEmptyDesc", "目前沒有可顯示的排行榜資料，請稍後重新整理。")}
                />
              )
            ) : (
              <GradingMatrixViewScreen
                questionProgress={questionProgress}
                students={filteredStudents}
                answersByQuestion={filteredAnswersByQuestion}
                onSelectCell={handleSelectMatrixCell}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default ContestExamGradingScreen;
