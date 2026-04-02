import { useEffect, useMemo, useRef, useState } from "react";
import { Tag } from "@carbon/react";
import { Flag, FlagFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import {
  ListPanel,
  ListHeader,
  ListFooter,
  ListItem,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
  ListItemTrailing,
} from "@/shared/ui/list/ListPanel";
import { EmptyState } from "@/shared/ui/EmptyState";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import layoutStyles from "@/features/contest/components/admin/layout/AdminSplitLayout.module.scss";
import QuestionSidebarScreen from "./QuestionSidebarScreen";
import GradingSplitPanelScreen from "./GradingSplitPanelScreen";
import GradingMobileNav from "./GradingMobileNav";
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
import styles from "./GradingByQuestion.module.scss";

interface GradingByQuestionTabScreenProps {
  questionProgress: QuestionProgress[];
  answersByQuestion: Map<string, GradingAnswerRow[]>;
  students: {
    studentId: string;
    username: string;
    nickname: string;
    displayName?: string;
  }[];
  onGrade: (answerId: string, score: number, feedback: string) => void;
  onUngrade?: (answerId: string) => void;
  flaggedIds?: Set<string>;
  onToggleFlag?: (answerId: string) => void;
  searchQuery: string;
  filter: GradingFilter;
  selectedQuestionId: string | null;
  onSelectedQuestionIdChange: (questionId: string | null) => void;
  selectedStudentId: string | null;
  onSelectedStudentIdChange: (studentId: string | null) => void;
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
  onUngrade,
  flaggedIds,
  onToggleFlag,
  searchQuery,
  filter,
  selectedQuestionId,
  onSelectedQuestionIdChange,
  selectedStudentId,
  onSelectedStudentIdChange,
  selectionRequest = null,
}: GradingByQuestionTabScreenProps) {
  const { t } = useTranslation("contest");
  const [isQuestionPaneCollapsed, setIsQuestionPaneCollapsed] = useState(false);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const cardListRef = useRef<HTMLDivElement>(null);
  const lastHandledSelectionNonceRef = useRef<number | null>(null);
  const lastAppliedSelectionStudentNonceRef = useRef<number | null>(null);
  const activeQuestionId = useMemo(() => {
    if (!selectedQuestionId) {
      return questionProgress[0]?.questionId ?? "";
    }
    const exists = questionProgress.some(
      (question) => question.questionId === selectedQuestionId,
    );
    return exists ? selectedQuestionId : (questionProgress[0]?.questionId ?? "");
  }, [questionProgress, selectedQuestionId]);

  useEffect(() => {
    if (!selectionRequest?.questionId) {
      return;
    }
    if (lastHandledSelectionNonceRef.current === selectionRequest.nonce) {
      return;
    }
    lastHandledSelectionNonceRef.current = selectionRequest.nonce;
    if (selectionRequest.questionId !== activeQuestionId) {
      onSelectedQuestionIdChange(selectionRequest.questionId);
    }
    setSelectedAnswerId(null);
  }, [
    activeQuestionId,
    onSelectedQuestionIdChange,
    selectionRequest?.nonce,
    selectionRequest?.questionId,
  ]);

  // Current question's answers (filtered by global toolbar state), including absent placeholders
  const currentAnswers = useMemo(() => {
    const existingRows = answersByQuestion.get(activeQuestionId) ?? [];
    const qInfo = questionProgress.find((q) => q.questionId === activeQuestionId);

    // Build set of students who have answered this question
    const answeredStudentIds = new Set(existingRows.map((r) => r.studentId));

    // Create absent placeholder rows for students with no answer
    const absentRows: GradingAnswerRow[] = students
      .filter((s) => !answeredStudentIds.has(s.studentId))
      .map((s) => ({
        id: `absent-${s.studentId}-${activeQuestionId}`,
        studentId: s.studentId,
        studentUsername: s.username,
        studentNickname: s.displayName || s.nickname || s.username,
        questionId: activeQuestionId,
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
  }, [answersByQuestion, activeQuestionId, filter, searchQuery, students, questionProgress]);

  useEffect(() => {
    const selectableRows = currentAnswers.filter((row) => !row.isAbsent);
    const selectedStillExists =
      selectedAnswerId !== null &&
      selectableRows.some((row) => row.id === selectedAnswerId);

    if (!selectedStillExists) {
      const firstUngraded = selectableRows.find((row) => row.score === null);
      const fallbackRow = firstUngraded ?? selectableRows[0] ?? null;
      setSelectedAnswerId(fallbackRow?.id ?? null);
    }
  }, [currentAnswers, selectedAnswerId]);

  useEffect(() => {
    if (!selectedStudentId) return;
    const selectedRow = currentAnswers.find(
      (row) => row.studentId === selectedStudentId && !row.isAbsent,
    );
    if (selectedRow && selectedRow.id !== selectedAnswerId) {
      setSelectedAnswerId(selectedRow.id);
    }
  }, [currentAnswers, selectedAnswerId, selectedStudentId]);

  useEffect(() => {
    if (!selectionRequest || activeQuestionId !== selectionRequest.questionId) {
      return;
    }
    if (lastAppliedSelectionStudentNonceRef.current === selectionRequest.nonce) {
      return;
    }
    const selectedRow = currentAnswers.find(
      (row) => row.studentId === selectionRequest.studentId && !row.isAbsent,
    );
    if (selectedRow) {
      setSelectedAnswerId(selectedRow.id);
      lastAppliedSelectionStudentNonceRef.current = selectionRequest.nonce;
    }
  }, [selectionRequest?.nonce, selectionRequest, activeQuestionId, currentAnswers]);

  // Scroll card list to the selected answer
  useEffect(() => {
    if (!selectedAnswerId || !cardListRef.current) return;
    const el = cardListRef.current.querySelector(
      `[data-answer-id="${selectedAnswerId}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedAnswerId]);

  const selectedAnswer = useMemo(
    () =>
      selectedAnswerId
        ? (answersByQuestion
            .get(activeQuestionId)
            ?.find((a) => a.id === selectedAnswerId) ?? null)
        : null,
    [answersByQuestion, activeQuestionId, selectedAnswerId]
  );
  const selectedQuestion = useMemo(
    () => questionProgress.find((q) => q.questionId === activeQuestionId) ?? null,
    [questionProgress, activeQuestionId],
  );
  const findNextUngraded = (): GradingAnswerRow | null => {
    const rows = answersByQuestion.get(activeQuestionId) ?? [];
    const currentIdx = rows.findIndex((r) => r.id === selectedAnswerId);
    for (let i = currentIdx + 1; i < rows.length; i++) {
      if (rows[i].score === null) return rows[i];
    }
    for (let i = 0; i < currentIdx; i++) {
      if (rows[i].score === null) return rows[i];
    }
    return null;
  };

  const handleQuestionSelect = (qId: string) => {
    onSelectedQuestionIdChange(qId);
    setSelectedAnswerId(null);
  };

  const handleNext = () => {
    const nextRow = findNextUngraded();
    if (!nextRow) return;
    // Keep selection sources in sync: otherwise selectedStudent effect may pull selection back.
    setSelectedAnswerId(nextRow.id);
    onSelectedStudentIdChange(nextRow.studentId);
  };

  const handleNextQuestion = () => {
    const currentIdx = questionProgress.findIndex(
      (question) => question.questionId === activeQuestionId,
    );
    if (currentIdx < 0 || currentIdx >= questionProgress.length - 1) {
      return;
    }
    const nextQuestionId = questionProgress[currentIdx + 1].questionId;
    onSelectedQuestionIdChange(nextQuestionId);
    setSelectedAnswerId(null);
  };

  const hasNext = !!findNextUngraded();
  const hasNextQuestion = useMemo(() => {
    const currentIdx = questionProgress.findIndex(
      (question) => question.questionId === activeQuestionId,
    );
    return currentIdx >= 0 && currentIdx < questionProgress.length - 1;
  }, [questionProgress, activeQuestionId]);

  const sidebarContent = (
    <QuestionSidebarScreen
      questions={questionProgress}
      selectedQuestionId={activeQuestionId}
      onSelect={handleQuestionSelect}
      collapsed={isQuestionPaneCollapsed}
      onToggleCollapse={() => setIsQuestionPaneCollapsed((prev) => !prev)}
    />
  );

  const middlePaneContent = (
    <ListPanel
      header={<ListHeader title={t("grading.answerList", "作答列表")} />}
      footer={
        <ListFooter>
          {t("grading.answersDisplayCount", "顯示 {{shown}} / {{total}} 位", {
            shown: currentAnswers.length,
            total: students.length,
          })}
        </ListFooter>
      }
    >
      <div ref={cardListRef}>
        {currentAnswers.length === 0 ? (
          <EmptyState
            title={searchQuery.trim() || filter !== "all"
              ? t("grading.noMatchingAnswers", "沒有符合條件的作答")
              : t("grading.noAnswersForQuestion", "此題目尚無學生作答")}
            compact
          />
        ) : (
          currentAnswers.map((a) => {
            const isSelected = a.id === selectedAnswerId;
            const isAbsent = a.isAbsent === true;
            return (
              <ListItem
                key={a.id}
                active={isSelected}
                onClick={
                  isAbsent
                    ? undefined
                    : () => {
                        setSelectedAnswerId(a.id);
                        onSelectedStudentIdChange(a.studentId);
                      }
                }
                className={isAbsent ? styles.absentItem : undefined}
              >
                <ListItemContent>
                  <ListItemTitle>{a.studentNickname}</ListItemTitle>
                  <ListItemMeta>{a.studentUsername}</ListItemMeta>
                </ListItemContent>
                <ListItemTrailing>
                  {!isAbsent && onToggleFlag && (
                    <button
                      className={styles.flagBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFlag(a.id);
                      }}
                      aria-label={t("grading.toggleFlag", "標記")}
                    >
                      {flaggedIds?.has(a.id) ? (
                        <FlagFilled size={14} className={styles.flagActive} />
                      ) : (
                        <Flag size={14} className={styles.flagInactive} />
                      )}
                    </button>
                  )}
                  {isAbsent ? (
                    <Tag type="red" size="sm">{t("grading.absent", "缺交")}</Tag>
                  ) : a.score !== null ? (
                    <span className={styles.scoreText}>
                      {a.score}/{a.maxScore}
                    </span>
                  ) : (
                    <Tag type="warm-gray" size="sm">{t("grading.ungraded", "未批改")}</Tag>
                  )}
                </ListItemTrailing>
              </ListItem>
            );
          })
        )}
      </div>
    </ListPanel>
  );

  return (
    <AdminSplitLayout
      sidebar={sidebarContent}
      sidebarWidth={
        isQuestionPaneCollapsed ? GRADING_COLLAPSED_LIST_WIDTH : GRADING_PRIMARY_LIST_WIDTH
      }
      middlePane={middlePaneContent}
      middlePaneWidth={GRADING_SECONDARY_LIST_WIDTH}
      contentClassName={styles.gradingContent}
      className={layoutStyles.mobileContentOnly}
    >
      <GradingMobileNav
        questionLabel={
          selectedQuestion ? `Q${selectedQuestion.questionIndex}` : "—"
        }
        studentLabel={
          selectedAnswer?.studentNickname ?? t("grading.noSelection", "未選擇")
        }
        questionContent={sidebarContent}
        studentContent={middlePaneContent}
      />
      <GradingSplitPanelScreen
        answer={selectedAnswer}
        onGrade={onGrade}
        onUngrade={onUngrade}
        isFlagged={selectedAnswer ? flaggedIds?.has(selectedAnswer.id) : false}
        onToggleFlag={onToggleFlag}
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
