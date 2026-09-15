import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loading,
  Button,
  Layer,
  Popover,
  PopoverContent,
  FluidSearch,
  FluidDropdown,
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
  const { refreshContest } = useContest();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const [selectionRequest, setSelectionRequest] = useState<{
    questionId: string;
    studentId: string;
    nonce: number;
  } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
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

  const hasActiveFilters = searchQuery.trim().length > 0 || filter !== "all";
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
        label: t("grading.byQuestion", "按題目批改"),
        icon: DocumentExport,
      },
      {
        value: "byStudent",
        label: t("grading.byStudent", "按學生批改"),
        icon: UserMultiple,
      },
      {
        value: "matrix",
        label: t("grading.matrixOverview", "矩陣總覽"),
        icon: Catalog,
      },
    ],
    [t],
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
      await Promise.all([refreshData(), refreshContest()]);
    });
  }, [refreshContest, refreshData, registerPanelRefresh]);

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
        description={t("grading.noAnswersDesc", "目前還沒有學生提交作答，請確認考試已開始且學生已完成作答後再進入批改。")}
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
            ariaLabel={t("grading.viewMode", "批改模式")}
            className={styles.modeSwitcher}
            tooltipPosition="bottom"
          />
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
                    {viewMode === "byQuestion" ? (
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
              answersByQuestion={answersByQuestion}
              students={students}
              onGrade={gradeAnswer}
              onUngrade={ungradeAnswer}
              flaggedIds={flaggedIds}
              onToggleFlag={toggleFlag}
              searchQuery={searchQuery}
              filter={filter}
              selectedQuestionId={selectedQuestionId}
              onSelectedQuestionIdChange={(questionId) =>
                updateGradingParams({ grading_question: questionId })
              }
              selectedStudentId={selectedStudentId}
              onSelectedStudentIdChange={(studentId) =>
                updateGradingParams({ grading_student: studentId })
              }
              selectionRequest={selectionRequest}
              onRefreshData={refreshData}
            />
          ) : viewMode === "byStudent" ? (
            <GradingByStudentTabScreen
              answersByStudent={answersByStudent}
              questionProgress={questionProgress}
              students={students}
              onGrade={gradeAnswer}
              onUngrade={ungradeAnswer}
              flaggedIds={flaggedIds}
              onToggleFlag={toggleFlag}
              searchQuery={searchQuery}
              selectedStudentId={selectedStudentId}
              onSelectedStudentIdChange={(studentId) =>
                updateGradingParams({ grading_student: studentId })
              }
            />
          ) : (
              <GradingMatrixViewScreen
                questionProgress={questionProgress}
                students={students}
                answersByQuestion={answersByQuestion}
                onSelectCell={handleSelectMatrixCell}
              />
          )}
        </div>
      </div>
    </div>
  );
};

export default ContestExamGradingScreen;
