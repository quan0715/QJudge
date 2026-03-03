import { useState, useMemo } from "react";
import {
  ContentSwitcher,
  Switch,
  Loading,
  Search,
  Dropdown,
  Button,
} from "@carbon/react";
import {
  GradingByQuestionTab,
  GradingByStudentTab,
  useGradingData,
  gradingFilterOptions,
} from "./grading";
import type { GradingFilter } from "./grading";
import { isSubjectiveType } from "./grading/gradingTypes";
import { useToast } from "@/shared/contexts/ToastContext";
import styles from "./grading/ContestExamGrading.module.scss";

const ContestExamGradingScreen: React.FC = () => {
  const [viewMode, setViewMode] = useState<0 | 1>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<GradingFilter>("all");
  const [objectiveRegradedOnce, setObjectiveRegradedOnce] = useState(false);
  const { showToast } = useToast();

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
        title: "客觀題重新批改完成（部分失敗）",
        subtitle: `更新 ${result.updated} 筆，失敗 ${result.failed} 筆，略過 ${result.skipped} 筆`,
      });
      return;
    }
    showToast({
      kind: "success",
      title: "客觀題重新批改完成",
      subtitle: `更新 ${result.updated} 筆，略過 ${result.skipped} 筆`,
    });
  };

  if (loading) {
    return (
      <div className={styles.editorLoading}>
        <Loading withOverlay={false} description="載入批改資料..." />
      </div>
    );
  }

  if (answers.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyStateTitle}>尚無作答資料</span>
        <span className={styles.emptyStateDesc}>
          目前還沒有學生提交作答，請確認考試已開始且學生已完成作答後再進入批改。
        </span>
      </div>
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
          <Switch name="byQuestion" text="按題目批改" />
          <Switch name="byStudent" text="按學生批改" />
        </ContentSwitcher>

        <div className={styles.toolbarSpacer} />

        <Search
          id="grading-search"
          labelText="搜尋學生"
          placeholder="搜尋學生..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="sm"
          className={styles.toolbarSearch}
        />

        {viewMode === 0 && (
          <Dropdown
            id="grading-filter"
            titleText=""
            label="篩選"
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
            {objectiveRegradedOnce ? "客觀題已重新批改" : "客觀題重新批改（一次）"}
          </Button>
        )}

        {visibleCount !== null && (
          <span className={styles.toolbarCount}>
            {visibleCount} 位學生
          </span>
        )}
      </div>

      {/* Editor body */}
      <div className={styles.editorBody}>
        {viewMode === 0 ? (
          <GradingByQuestionTab
            questionProgress={questionProgress}
            answersByQuestion={answersByQuestion}
            students={students}
            onGrade={gradeAnswer}
            searchQuery={searchQuery}
            filter={filter}
          />
        ) : (
          <GradingByStudentTab
            answersByStudent={answersByStudent}
            students={students}
            onGrade={gradeAnswer}
            searchQuery={searchQuery}
          />
        )}
      </div>
    </div>
  );
};

export default ContestExamGradingScreen;
