import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  ContentSwitcher,
  Switch,
  Loading,
  Button,
  Tag,
  OverflowMenu,
  OverflowMenuItem,
} from "@carbon/react";
import {
  GradingByQuestionTabScreen,
  GradingByStudentTabScreen,
  GradingMatrixView,
  useGradingData,
} from "./grading";
import type { GradingFilter } from "./grading";
import { isSubjectiveType } from "./grading/gradingTypes";
import { useTranslation } from "react-i18next";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { updateContest } from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts/ToastContext";
import { EmptyState } from "@/shared/ui/EmptyState";
import styles from "./grading/ContestExamGrading.module.scss";

const ContestExamGradingScreen: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest, refreshContest } = useContest();
  const [viewMode, setViewMode] = useState<"byQuestion" | "byStudent" | "matrix">("byQuestion");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<GradingFilter>("all");
  const [objectiveRegradedOnce, setObjectiveRegradedOnce] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [selectionRequest, setSelectionRequest] = useState<{
    questionId: string;
    studentId: string;
    nonce: number;
  } | null>(null);
  const { showToast } = useToast();
  const { t } = useTranslation("contest");

  const published = !!contest?.resultsPublished;

  const handleTogglePublish = async () => {
    if (!contestId) return;
    const next = !published;
    setPublishingResults(true);
    try {
      await updateContest(contestId, { resultsPublished: next } as any);
      await refreshContest();
      showToast({ kind: "success", title: next ? t("grading.publishSuccess", "成績已發布") : t("grading.unpublishSuccess", "已撤回發布") });
    } catch {
      showToast({ kind: "error", title: next ? t("grading.publishFailed", "發布失敗") : t("grading.unpublishFailed", "撤回失敗") });
    } finally {
      setPublishingResults(false);
    }
  };

  const {
    answers,
    answersByQuestion,
    answersByStudent,
    questionProgress,
    students,
    gradeAnswer,
    regradeObjectiveAnswers,
    regradingObjective,
    loading,
  } = useGradingData();

  const objectiveAnswerCount = useMemo(
    () => answers.filter((row) => !isSubjectiveType(row.questionType)).length,
    [answers],
  );
  const ungradedCount = useMemo(
    () => answers.filter((row) => row.score === null).length,
    [answers],
  );

  const handleViewChange = (e: { index?: number; name?: string | number; text?: string; key?: string | number }) => {
    const nextMode = (e.name as "byQuestion" | "byStudent" | "matrix") ?? "byQuestion";
    setViewMode(nextMode);
    setSearchQuery("");
    setFilter("all");
  };

  const handleSelectMatrixCell = (questionId: string, studentId: string) => {
    setSelectionRequest({ questionId, studentId, nonce: Date.now() });
    setViewMode("byQuestion");
  };

  const handleRegradeObjective = async () => {
    const result = await regradeObjectiveAnswers();
    setObjectiveRegradedOnce(true);
    if (result.failed > 0) {
      showToast({
        kind: "warning",
        title: t("grading.objectiveRegradePartialFail", "客觀題重新批改完成（部分失敗）"),
        subtitle: t("grading.regradePartialDetail", { updated: result.updated, failed: result.failed, skipped: result.skipped }),
      });
      return;
    }
    showToast({
      kind: "success",
      title: t("grading.objectiveRegradeComplete", "客觀題重新批改完成"),
      subtitle: t("grading.regradeDetail", { updated: result.updated, skipped: result.skipped }),
    });
  };

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
          <div className={styles.globalTitle}>
            {contest?.name || t("grading.gradingCenter", "批改中心")}
          </div>
          <div className={styles.globalMeta}>
            {t("grading.globalSummary", "題目 {{questions}} 題 · 作答 {{answers}} 筆 · 待批改 {{pending}} 筆", {
              questions: questionProgress.length,
              answers: answers.length,
              pending: ungradedCount,
            })}
          </div>
        </div>

        <div className={styles.toolbarSpacer} />

        {objectiveAnswerCount > 0 ? (
          <OverflowMenu
            ariaLabel={t("grading.moreActions", "更多操作")}
            className={styles.toolbarOverflow}
            size="sm"
            flipped
          >
            <OverflowMenuItem
              itemText={
                objectiveRegradedOnce
                  ? t("grading.autoGraded", "已自動批改")
                  : t("grading.autoGrade", "自動批改客觀題")
              }
              disabled={regradingObjective || objectiveRegradedOnce}
              onClick={handleRegradeObjective}
            />
          </OverflowMenu>
        ) : null}

        <div className={styles.toolbarDivider} />
        <Tag type={published ? "green" : "gray"} size="sm">
          {published ? t("grading.published", "已發布") : t("grading.unpublished", "未發布")}
        </Tag>
        <Button
          kind={published ? "danger--ghost" : "primary"}
          size="sm"
          disabled={publishingResults}
          onClick={handleTogglePublish}
          className={styles.toolbarAction}
        >
          {published ? t("grading.unpublishResults", "撤回發布") : t("grading.publishResults", "發布成績")}
        </Button>
      </div>

      <div className={styles.localToolbar}>
        <ContentSwitcher
          onChange={handleViewChange}
          selectedIndex={viewMode === "byStudent" ? 1 : viewMode === "matrix" ? 2 : 0}
          size="sm"
          className={styles.toolbarSwitcher}
        >
          <Switch name="byQuestion" text={t("grading.byQuestion", "按題目批改")} />
          <Switch name="byStudent" text={t("grading.byStudent", "按學生批改")} />
          <Switch name="matrix" text={t("grading.matrixOverview", "矩陣總覽")} />
        </ContentSwitcher>

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
              searchQuery={searchQuery}
              filter={filter}
              onSearchChange={setSearchQuery}
              onFilterChange={setFilter}
              selectionRequest={selectionRequest}
            />
          ) : viewMode === "byStudent" ? (
            <GradingByStudentTabScreen
              answersByStudent={answersByStudent}
              students={students}
              onGrade={gradeAnswer}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          ) : (
            <GradingMatrixView
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
