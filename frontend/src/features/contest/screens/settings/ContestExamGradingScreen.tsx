import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  ContentSwitcher,
  Switch,
  Loading,
  Search,
  Dropdown,
  Button,
  Tag,
} from "@carbon/react";
import {
  GradingByQuestionTabScreen,
  GradingByStudentTabScreen,
  useGradingData,
  gradingFilterOptions,
} from "./grading";
import type { GradingFilter } from "./grading";
import { isSubjectiveType } from "./grading/gradingTypes";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { updateContest } from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts/ToastContext";
import { EmptyState } from "@/shared/ui/EmptyState";
import ExamVideoReviewModal from "@/features/contest/components/admin/ExamVideoReviewModal";
import styles from "./grading/ContestExamGrading.module.scss";

const ContestExamGradingScreen: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest, refreshContest } = useContest();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<0 | 1>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<GradingFilter>("all");
  const [objectiveRegradedOnce, setObjectiveRegradedOnce] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const { showToast } = useToast();
  const { t } = useTranslation("contest");

  const published = !!contest?.resultsPublished;
  const canDeleteExamVideos = useMemo(() => {
    if (!contest || !user) return false;
    if (contest.permissions?.canDeleteContest) return true;
    return Boolean(contest.ownerUsername && user.username === contest.ownerUsername);
  }, [contest, user]);

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

  // Compute visible count for display
  const visibleCount = useMemo(() => {
    if (viewMode === 1) {
      // ByStudent — count filtered students
      if (!searchQuery.trim()) return students.length;
      const q = searchQuery.toLowerCase().trim();
      return students.filter(
        (s) =>
          s.username.toLowerCase().includes(q) ||
          s.nickname.toLowerCase().includes(q)
      ).length;
    }
    return null; // ByQuestion count is per-question, shown inside
  }, [viewMode, students, searchQuery]);

  const handleViewChange = (e: { index?: number; name?: string | number; text?: string; key?: string | number }) => {
    setViewMode((e.index ?? 0) as 0 | 1);
    setSearchQuery("");
    setFilter("all");
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
      {/* Single unified toolbar */}
      <div className={styles.editorToolbar}>
        <ContentSwitcher
          onChange={handleViewChange}
          selectedIndex={viewMode}
          size="sm"
          className={styles.toolbarSwitcher}
        >
          <Switch name="byQuestion" text={t("grading.byQuestion", "按題目批改")} />
          <Switch name="byStudent" text={t("grading.byStudent", "按學生批改")} />
        </ContentSwitcher>

        <div className={styles.toolbarSpacer} />

        <Search
          id="grading-search"
          labelText={t("grading.searchStudent", "搜尋學生")}
          placeholder={t("grading.searchStudent", "搜尋學生") + "..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="sm"
          className={styles.toolbarSearch}
        />

        {viewMode === 0 && (
          <Dropdown
            id="grading-filter"
            titleText=""
            label={t("grading.filter", "篩選")}
            items={gradingFilterOptions}
            itemToString={(item) => item?.label ?? ""}
            selectedItem={gradingFilterOptions.find((o) => o.id === filter)}
            onChange={({ selectedItem }) =>
              setFilter((selectedItem?.id as GradingFilter) ?? "all")
            }
            size="sm"
            className={styles.toolbarFilter}
          />
        )}

        {objectiveAnswerCount > 0 && (
          <Button
            kind="ghost"
            size="sm"
            disabled={regradingObjective || objectiveRegradedOnce}
            onClick={handleRegradeObjective}
            className={styles.toolbarAction}
          >
            {objectiveRegradedOnce ? t("grading.autoGraded", "已自動批改") : t("grading.autoGrade", "自動批改客觀題")}
          </Button>
        )}

        {visibleCount !== null && (
          <span className={styles.toolbarCount}>
            {t("grading.studentsCount", { count: visibleCount })}
          </span>
        )}

        <div className={styles.toolbarDivider} />
        <Button
          kind="secondary"
          size="sm"
          onClick={() => setVideoModalOpen(true)}
          className={styles.toolbarAction}
        >
          監控影片
        </Button>

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

      {/* Editor body */}
      <div className={styles.editorBody}>
        {viewMode === 0 ? (
          <GradingByQuestionTabScreen
            questionProgress={questionProgress}
            answersByQuestion={answersByQuestion}
            students={students}
            onGrade={gradeAnswer}
            searchQuery={searchQuery}
            filter={filter}
          />
        ) : (
          <GradingByStudentTabScreen
            answersByStudent={answersByStudent}
            students={students}
            onGrade={gradeAnswer}
            searchQuery={searchQuery}
          />
        )}
      </div>
      <ExamVideoReviewModal
        contestId={contestId}
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        canDelete={canDeleteExamVideos}
      />
    </div>
  );
};

export default ContestExamGradingScreen;
