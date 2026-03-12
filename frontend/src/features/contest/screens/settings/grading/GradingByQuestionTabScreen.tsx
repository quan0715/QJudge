import { useEffect, useMemo, useState } from "react";
import { Button, FluidDropdown, FluidSearch, Tag } from "@carbon/react";
import { ChevronLeft, ChevronRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import QuestionSidebarScreen from "./QuestionSidebarScreen";
import GradingSplitPanelScreen from "./GradingSplitPanelScreen";
import {
  GRADING_COLLAPSED_LIST_WIDTH,
  GRADING_PRIMARY_LIST_WIDTH,
  GRADING_SECONDARY_LIST_WIDTH,
} from "./gradingTypes";
import type {
  GradingAnswerRow,
  QuestionProgress,
  GradingFilter,
} from "./gradingTypes";
import { gradingFilterOptions } from "./gradingTypes";
import styles from "./GradingByQuestion.module.scss";

interface GradingByQuestionTabScreenProps {
  questionProgress: QuestionProgress[];
  answersByQuestion: Map<string, GradingAnswerRow[]>;
  students: { studentId: string; username: string; nickname: string }[];
  onGrade: (answerId: string, score: number, feedback: string) => void;
  searchQuery: string;
  filter: GradingFilter;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: GradingFilter) => void;
  selectionRequest?: {
    questionId: string;
    studentId: string;
    nonce: number;
  } | null;
}

export default function GradingByQuestionTabScreen({
  questionProgress,
  answersByQuestion,
  students,
  onGrade,
  searchQuery,
  filter,
  onSearchChange,
  onFilterChange,
  selectionRequest = null,
}: GradingByQuestionTabScreenProps) {
  const { t } = useTranslation("contest");
  type FilterOption = { id: GradingFilter; label: string };
  const [isQuestionPaneCollapsed, setIsQuestionPaneCollapsed] = useState(false);
  const [isAnswerPaneCollapsed, setIsAnswerPaneCollapsed] = useState(false);
  const [hoveredQuestionId, setHoveredQuestionId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    questionProgress[0]?.questionId ?? ""
  );
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);

  useEffect(() => {
    if (questionProgress.length === 0) {
      if (selectedQuestionId !== "") {
        setSelectedQuestionId("");
      }
      return;
    }

    const questionExists = questionProgress.some(
      (question) => question.questionId === selectedQuestionId,
    );
    if (!selectedQuestionId || !questionExists) {
      setSelectedQuestionId(questionProgress[0].questionId);
    }
  }, [questionProgress, selectedQuestionId]);

  useEffect(() => {
    if (!selectionRequest?.questionId) {
      return;
    }
    setSelectedQuestionId(selectionRequest.questionId);
    setSelectedAnswerId(null);
  }, [selectionRequest?.nonce, selectionRequest?.questionId]);

  // Current question's answers (filtered + searched), including absent placeholders
  const currentAnswers = useMemo(() => {
    const existingRows = answersByQuestion.get(selectedQuestionId) ?? [];
    const qInfo = questionProgress.find((q) => q.questionId === selectedQuestionId);

    // Build set of students who have answered this question
    const answeredStudentIds = new Set(existingRows.map((r) => r.studentId));

    // Create absent placeholder rows for students with no answer
    const absentRows: GradingAnswerRow[] = students
      .filter((s) => !answeredStudentIds.has(s.studentId))
      .map((s) => ({
        id: `absent-${s.studentId}-${selectedQuestionId}`,
        studentId: s.studentId,
        studentUsername: s.username,
        studentNickname: s.nickname,
        questionId: selectedQuestionId,
        questionIndex: qInfo?.questionIndex ?? 0,
        questionPrompt: qInfo?.prompt ?? "",
        questionType: qInfo?.questionType ?? "short_answer",
        questionOptions: [],
        maxScore: qInfo?.maxScore ?? 0,
        answerContent: {},
        score: null,
        feedback: "",
        gradedBy: null,
        gradedAt: null,
        isAutoGraded: false,
        correctAnswer: null,
        isAbsent: true,
      }));

    let rows = [...existingRows, ...absentRows];

    if (filter === "graded") rows = rows.filter((r) => r.score !== null);
    if (filter === "ungraded") rows = rows.filter((r) => r.score === null && !r.isAbsent);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.studentUsername.toLowerCase().includes(q) ||
          r.studentNickname.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [answersByQuestion, selectedQuestionId, filter, searchQuery, students, questionProgress]);

  useEffect(() => {
    const selectableRows = currentAnswers.filter((row) => !row.isAbsent);
    const selectedStillExists =
      selectedAnswerId !== null &&
      selectableRows.some((row) => row.id === selectedAnswerId);

    if (!selectedStillExists) {
      setSelectedAnswerId(selectableRows[0]?.id ?? null);
    }
  }, [currentAnswers, selectedAnswerId]);

  useEffect(() => {
    if (!selectionRequest || selectedQuestionId !== selectionRequest.questionId) {
      return;
    }
    const selectedRow = currentAnswers.find(
      (row) => row.studentId === selectionRequest.studentId && !row.isAbsent,
    );
    if (selectedRow) {
      setSelectedAnswerId(selectedRow.id);
    }
  }, [selectionRequest?.nonce, selectionRequest, selectedQuestionId, currentAnswers]);

  const selectedAnswer = useMemo(
    () =>
      selectedAnswerId
        ? (answersByQuestion
            .get(selectedQuestionId)
            ?.find((a) => a.id === selectedAnswerId) ?? null)
        : null,
    [answersByQuestion, selectedQuestionId, selectedAnswerId]
  );
  const selectedQuestion = useMemo(
    () => questionProgress.find((q) => q.questionId === selectedQuestionId) ?? null,
    [questionProgress, selectedQuestionId],
  );
  const previewQuestion = useMemo(() => {
    const targetQuestionId = hoveredQuestionId ?? selectedQuestionId;
    if (!targetQuestionId) {
      return null;
    }
    const q = questionProgress.find((question) => question.questionId === targetQuestionId);
    if (!q) {
      return null;
    }
    const qRows = answersByQuestion.get(targetQuestionId) ?? [];
    const scoredRows = qRows.filter((row) => row.score !== null);
    const avgScore =
      scoredRows.length > 0
        ? (scoredRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / scoredRows.length)
            .toFixed(1)
        : null;
    return {
      questionIndex: q.questionIndex,
      gradedCount: q.gradedCount,
      totalAnswers: q.totalAnswers,
      avgScore,
    };
  }, [hoveredQuestionId, selectedQuestionId, questionProgress, answersByQuestion]);

  const findNextUngraded = (): string | null => {
    const rows = answersByQuestion.get(selectedQuestionId) ?? [];
    const currentIdx = rows.findIndex((r) => r.id === selectedAnswerId);
    for (let i = currentIdx + 1; i < rows.length; i++) {
      if (rows[i].score === null) return rows[i].id;
    }
    for (let i = 0; i < currentIdx; i++) {
      if (rows[i].score === null) return rows[i].id;
    }
    return null;
  };

  const handleQuestionSelect = (qId: string) => {
    setSelectedQuestionId(qId);
    setSelectedAnswerId(null);
  };

  const handleNext = () => {
    const nextId = findNextUngraded();
    if (nextId) setSelectedAnswerId(nextId);
  };

  const handleNextQuestion = () => {
    const currentIdx = questionProgress.findIndex(
      (question) => question.questionId === selectedQuestionId,
    );
    if (currentIdx < 0 || currentIdx >= questionProgress.length - 1) {
      return;
    }
    const nextQuestionId = questionProgress[currentIdx + 1].questionId;
    setSelectedQuestionId(nextQuestionId);
    setSelectedAnswerId(null);
  };

  const hasNext = !!findNextUngraded();
  const hasNextQuestion = useMemo(() => {
    const currentIdx = questionProgress.findIndex(
      (question) => question.questionId === selectedQuestionId,
    );
    return currentIdx >= 0 && currentIdx < questionProgress.length - 1;
  }, [questionProgress, selectedQuestionId]);

  const sidebarContent = (
    <QuestionSidebarScreen
      questions={questionProgress}
      selectedQuestionId={selectedQuestionId}
      onSelect={handleQuestionSelect}
      onHoverQuestion={setHoveredQuestionId}
      collapsed={isQuestionPaneCollapsed}
      onToggleCollapse={() => setIsQuestionPaneCollapsed((prev) => !prev)}
    />
  );

  const middlePaneContent = isAnswerPaneCollapsed ? (
    <div className={styles.collapsedPane}>
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={ChevronRight}
        iconDescription={t("grading.expandAnswerList", "展開作答列表")}
        onClick={() => setIsAnswerPaneCollapsed(false)}
      />
    </div>
  ) : (
    <div className={styles.tableCol}>
      <div className={styles.paneHeaderRow}>
        <div className={styles.sidebarHeader}>{t("grading.answerList", "作答列表")}</div>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={ChevronLeft}
          iconDescription={t("grading.collapseAnswerList", "收摺作答列表")}
          onClick={() => setIsAnswerPaneCollapsed(true)}
        />
      </div>
      <div className={styles.listControls}>
        <div className={styles.toolbarSearch}>
          <FluidSearch
            id="grading-answer-search"
            labelText={t("grading.searchStudent", "搜尋學生")}
            placeholder={t("grading.searchStudent", "搜尋學生") + "..."}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className={styles.toolbarFilter}>
          <FluidDropdown
            id="grading-answer-filter"
            titleText={t("grading.filter", "篩選")}
            label={t("grading.filter", "篩選")}
            items={gradingFilterOptions}
            itemToString={(item) => (item as FilterOption | null)?.label ?? ""}
            selectedItem={
              (gradingFilterOptions.find((option) => option.id === filter) as FilterOption | undefined) ?? null
            }
            onChange={({ selectedItem }) =>
              onFilterChange((selectedItem as FilterOption | null)?.id ?? "all")
            }
          />
        </div>
        <div className={styles.toolbarMeta}>
          <span>
            {t("grading.answersDisplayCount", "顯示 {{shown}} / {{total}} 位", {
              shown: currentAnswers.length,
              total: students.length,
            })}
          </span>
        </div>
      </div>
      {previewQuestion ? (
        <div className={styles.previewBar} aria-live="polite">
          {previewQuestion.totalAnswers > 0
            ? t(
                "grading.previewQuestionSummary",
                "Q{{index}} · {{graded}}/{{total}} 已批改 · 平均 {{avg}}",
                {
                  index: previewQuestion.questionIndex,
                  graded: previewQuestion.gradedCount,
                  total: previewQuestion.totalAnswers,
                  avg: previewQuestion.avgScore ?? "-",
                },
              )
            : t(
                "grading.previewQuestionNoAnswers",
                "Q{{index}} · 尚無作答資料",
                { index: previewQuestion.questionIndex },
              )}
        </div>
      ) : null}
      <div className={styles.cardList}>
        {currentAnswers.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateDesc}>
              {searchQuery.trim() || filter !== "all"
                ? t("grading.noMatchingAnswers", "沒有符合條件的作答")
                : t("grading.noAnswersForQuestion", "此題目尚無學生作答")}
            </span>
          </div>
        ) : (
          currentAnswers.map((a) => {
            const isSelected = a.id === selectedAnswerId;
            const isAbsent = a.isAbsent === true;
            const statusClass = isAbsent
              ? styles.statusEmpty
              : a.score !== null
                ? styles.statusDone
                : styles.statusPending;
            return (
              <div
                key={a.id}
                className={`${styles.answerCard} ${isSelected ? styles.answerCardActive : ""}`}
                onClick={isAbsent ? undefined : () => setSelectedAnswerId(a.id)}
                style={isAbsent ? { cursor: "default", opacity: 0.7 } : undefined}
              >
                <div className={styles.cardPrimary}>
                  <span className={styles.cardLabelRow}>
                    <span className={`${styles.statusDot} ${statusClass}`} />
                    <span>{a.studentNickname}</span>
                  </span>
                  {isAbsent ? (
                    <Tag type="red" size="sm">{t("grading.absent", "缺交")}</Tag>
                  ) : a.score !== null ? (
                    <span className={styles.scoreText}>
                      {a.score}/{a.maxScore}
                    </span>
                  ) : (
                    <Tag type="warm-gray" size="sm">{t("grading.ungraded", "未批改")}</Tag>
                  )}
                </div>
                <div className={styles.cardSecondary}>
                  <span>{a.studentUsername}</span>
                  <span>
                    {isAbsent ? "" : a.gradedBy === "system" ? (
                      <Tag type="cyan" size="sm">{t("grading.autoGraded", "自動")}</Tag>
                    ) : a.gradedBy ?? ""}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <AdminSplitLayout
      sidebar={sidebarContent}
      sidebarWidth={
        isQuestionPaneCollapsed ? GRADING_COLLAPSED_LIST_WIDTH : GRADING_PRIMARY_LIST_WIDTH
      }
      middlePane={middlePaneContent}
      middlePaneWidth={
        isAnswerPaneCollapsed ? GRADING_COLLAPSED_LIST_WIDTH : GRADING_SECONDARY_LIST_WIDTH
      }
      contentClassName={styles.gradingContent}
    >
      <GradingSplitPanelScreen
        answer={selectedAnswer}
        onGrade={onGrade}
        flowMode="byQuestion"
        onNextQuestion={handleNextQuestion}
        hasNextQuestion={hasNextQuestion}
        onNextStudent={handleNext}
        hasNextStudent={hasNext}
        contextPath={{
          primary: selectedQuestion
            ? `Q${selectedQuestion.questionIndex}`
            : t("grading.question", "題目"),
          secondary: selectedAnswer
            ? `${selectedAnswer.studentNickname} (${selectedAnswer.studentUsername})`
            : undefined,
        }}
      />
    </AdminSplitLayout>
  );
}
