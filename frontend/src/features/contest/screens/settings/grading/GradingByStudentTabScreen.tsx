import { useState, useMemo, useCallback, useEffect } from "react";
import { Button, Tag } from "@carbon/react";
import {
  Boolean as BooleanIcon,
  Checkbox as CheckboxIcon,
  ChevronLeft,
  ChevronRight,
  Document,
  Pen,
  RadioButton as RadioButtonIcon,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import GradingSplitPanelScreen from "./GradingSplitPanelScreen";
import {
  GRADING_COLLAPSED_LIST_WIDTH,
  GRADING_PRIMARY_LIST_WIDTH,
  GRADING_SECONDARY_LIST_WIDTH,
  type GradingAnswerRow,
  type QuestionProgress,
} from "./gradingTypes";
import styles from "./GradingByStudent.module.scss";
import mini from "./GradingMini.module.scss";

const QUESTION_TYPE_ICON = {
  single_choice: RadioButtonIcon,
  multiple_choice: CheckboxIcon,
  true_false: BooleanIcon,
  short_answer: Pen,
  essay: Document,
} as const;

interface StudentSummary {
  studentId: string;
  username: string;
  nickname: string;
  totalScore: number;
  maxPossible: number;
  gradedCount: number;
  totalCount: number;
}

interface GradingByStudentTabScreenProps {
  answersByStudent: Map<string, GradingAnswerRow[]>;
  questionProgress: QuestionProgress[];
  students: { studentId: string; username: string; nickname: string }[];
  onGrade: (answerId: string, score: number, feedback: string) => void;
  searchQuery: string;
  selectedStudentId: string | null;
  onSelectedStudentIdChange: (studentId: string | null) => void;
}

export default function GradingByStudentTabScreen({
  answersByStudent,
  questionProgress,
  students,
  onGrade,
  searchQuery,
  selectedStudentId,
  onSelectedStudentIdChange,
}: GradingByStudentTabScreenProps) {
  const { t } = useTranslation("contest");
  const [isQuestionPaneCollapsed, setIsQuestionPaneCollapsed] = useState(false);
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState(0);
  const orderedQuestions = useMemo(
    () => [...questionProgress].sort((left, right) => left.questionIndex - right.questionIndex),
    [questionProgress],
  );

  const studentSummaries = useMemo<StudentSummary[]>(() => {
    return students.map((s) => {
      const answers = answersByStudent.get(s.studentId) ?? [];
      const gradedCount = answers.filter((a) => a.score !== null).length;
      const totalScore = answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
      const maxPossible = answers.reduce((sum, a) => sum + a.maxScore, 0);
      return {
        studentId: s.studentId,
        username: s.username,
        nickname: s.nickname,
        totalScore,
        maxPossible,
        gradedCount,
        totalCount: answers.length,
      };
    });
  }, [students, answersByStudent]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return studentSummaries;
    const q = searchQuery.toLowerCase().trim();
    return studentSummaries.filter(
      (s) =>
        s.username.toLowerCase().includes(q) ||
        s.nickname.toLowerCase().includes(q)
    );
  }, [studentSummaries, searchQuery]);
  const activeSelectedStudentId = useMemo(() => {
    if (filtered.length === 0) return null;
    if (
      selectedStudentId &&
      filtered.some((student) => student.studentId === selectedStudentId)
    ) {
      return selectedStudentId;
    }
    return filtered[0].studentId;
  }, [filtered, selectedStudentId]);
  const activeStudent = useMemo(
    () => students.find((student) => student.studentId === activeSelectedStudentId) ?? null,
    [students, activeSelectedStudentId],
  );

  const currentStudentAnswers = useMemo(
    () => {
      if (!activeSelectedStudentId) return [];
      const studentAnswers = answersByStudent.get(activeSelectedStudentId) ?? [];
      const answerByQuestionId = new Map(
        studentAnswers.map((answer) => [answer.questionId, answer] as const),
      );

      return orderedQuestions.map((question) => {
        const existing = answerByQuestionId.get(question.questionId);
        if (existing) {
          return existing;
        }
        return {
          id: `absent-${activeSelectedStudentId}-${question.questionId}`,
          studentId: activeSelectedStudentId,
          studentUsername: activeStudent?.username ?? "",
          studentNickname: activeStudent?.nickname ?? "",
          questionId: question.questionId,
          questionIndex: question.questionIndex,
          questionPrompt: question.prompt,
          questionType: question.questionType,
          questionOptions: [],
          maxScore: question.maxScore,
          answerContent: {},
          score: null,
          feedback: "",
          gradedBy: null,
          gradedAt: null,
          isAutoGraded: false,
          correctAnswer: null,
          isAbsent: true,
        } satisfies GradingAnswerRow;
      });
    },
    [activeSelectedStudentId, answersByStudent, orderedQuestions, activeStudent],
  );

  const selectableIndexes = useMemo(
    () =>
      currentStudentAnswers.reduce<number[]>((indexes, answer, index) => {
        if (!answer.isAbsent) {
          indexes.push(index);
        }
        return indexes;
      }, []),
    [currentStudentAnswers],
  );
  const nextSelectableIdx = useMemo(
    () => selectableIndexes.find((index) => index > selectedAnswerIdx) ?? -1,
    [selectableIndexes, selectedAnswerIdx],
  );
  const hasAnySubmission = selectableIndexes.length > 0;
  const currentAnswer =
    hasAnySubmission
      ? (currentStudentAnswers[selectedAnswerIdx] ?? null)
      : null;
  const selectedStudentSummary = useMemo(
    () => filtered.find((student) => student.studentId === activeSelectedStudentId) ?? null,
    [filtered, activeSelectedStudentId],
  );
  const hasNext = nextSelectableIdx >= 0;

  useEffect(() => {
    setSelectedAnswerIdx(0);
  }, [activeSelectedStudentId]);

  useEffect(() => {
    if (currentStudentAnswers.length === 0) {
      if (selectedAnswerIdx !== 0) {
        setSelectedAnswerIdx(0);
      }
      return;
    }

    if (selectedAnswerIdx >= currentStudentAnswers.length) {
      setSelectedAnswerIdx(0);
      return;
    }
    if (currentStudentAnswers[selectedAnswerIdx]?.isAbsent) {
      const firstSelectableIdx = selectableIndexes[0];
      if (firstSelectableIdx !== undefined && firstSelectableIdx !== selectedAnswerIdx) {
        setSelectedAnswerIdx(firstSelectableIdx);
      }
    }
  }, [currentStudentAnswers, selectableIndexes, selectedAnswerIdx]);

  // Find next student in filtered list
  const currentStudentFilteredIdx = useMemo(() => {
    if (!activeSelectedStudentId) return -1;
    return filtered.findIndex((s) => s.studentId === activeSelectedStudentId);
  }, [filtered, activeSelectedStudentId]);

  const hasNextStudent = currentStudentFilteredIdx >= 0 && currentStudentFilteredIdx < filtered.length - 1;

  const handleStudentSelect = (studentId: string) => {
    onSelectedStudentIdChange(studentId);
    setSelectedAnswerIdx(0);
  };

  const handleNext = () => {
    if (nextSelectableIdx >= 0) {
      setSelectedAnswerIdx(nextSelectableIdx);
    }
  };

  const handleNextStudent = useCallback(() => {
    if (!hasNextStudent) return;
    const nextStudent = filtered[currentStudentFilteredIdx + 1];
    onSelectedStudentIdChange(nextStudent.studentId);
    setSelectedAnswerIdx(0);
  }, [filtered, currentStudentFilteredIdx, hasNextStudent, onSelectedStudentIdChange]);

  const sidebarContent = (
    <div className={styles.pane}>
      <div className={styles.paneHeaderRow}>
        <div className={styles.sidebarHeader}>{t("grading.studentList", "學生列表")}</div>
      </div>
      <div className={styles.cardList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateDesc}>
              {searchQuery.trim()
                ? t("grading.noMatchingStudents", "沒有符合搜尋條件的學生")
                : t("grading.noStudents", "尚無學生資料")}
            </span>
          </div>
        ) : (
          filtered.map((s) => {
            const isSelected = s.studentId === activeSelectedStudentId;
            return (
              <div
                key={s.studentId}
                className={`${styles.answerCard} ${isSelected ? styles.answerCardActive : ""}`}
                onClick={() => handleStudentSelect(s.studentId)}
              >
                <div className={styles.cardPrimary}>
                  <span className={styles.cardLabelRow}>
                    <span>{s.nickname}</span>
                  </span>
                  <span>
                    <span style={{ fontWeight: 600 }}>{s.totalScore}</span>
                    <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.8125rem" }}>
                      {" "}/ {s.maxPossible}
                    </span>
                  </span>
                </div>
                <div className={styles.cardSecondary}>
                  <span>{s.username}</span>
                  {s.totalCount === 0 ? (
                    <Tag type="red" size="sm">{t("grading.absent", "缺交")}</Tag>
                  ) : s.gradedCount === s.totalCount ? (
                    <Tag type="green" size="sm">{t("grading.complete", "完成")}</Tag>
                  ) : (
                    <span>{s.gradedCount}/{s.totalCount} {t("grading.complete", "完成")}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className={styles.listFooter}>
        <span>
          {t("grading.studentsDisplayCount", "顯示 {{shown}} / {{total}} 位", {
            shown: filtered.length,
            total: students.length,
          })}
        </span>
      </div>
    </div>
  );

  const middlePaneContent = isQuestionPaneCollapsed ? (
    <div className={mini.miniPane}>
      <div className={mini.miniHeader}>
        <button
          type="button"
          className={mini.miniToggleButton}
          onClick={() => setIsQuestionPaneCollapsed(false)}
          aria-label={t("grading.expandQuestionList", "展開題目列表")}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className={mini.miniList}>
        {activeSelectedStudentId && currentStudentAnswers.length > 0 ? (
          currentStudentAnswers.map((answer, idx) => {
            const statusClass = answer.isAbsent
              ? mini.statusEmpty
              : answer.score !== null
                ? mini.statusDone
                : mini.statusPending;
            return (
              <button
                key={answer.id}
                type="button"
                className={`${mini.miniItem} ${
                  idx === selectedAnswerIdx ? mini.statusActive : ""
                } ${statusClass}`}
                onClick={answer.isAbsent ? undefined : () => setSelectedAnswerIdx(idx)}
                disabled={answer.isAbsent}
                aria-label={`Q${answer.questionIndex}`}
              >
                Q{answer.questionIndex}
              </button>
            );
          })
        ) : null}
      </div>
      <div className={mini.miniFooter} />
    </div>
  ) : (
    <div className={styles.pane}>
      <div className={styles.paneHeaderRow}>
        <div className={styles.sidebarHeader}>{t("grading.questionList", "題目列表")}</div>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={ChevronLeft}
          iconDescription={t("grading.collapseQuestionList", "收摺題目列表")}
          onClick={() => setIsQuestionPaneCollapsed(true)}
        />
      </div>
      <div className={styles.cardList}>
        {activeSelectedStudentId && currentStudentAnswers.length > 0 ? (
          currentStudentAnswers.map((a, i) => {
            const isActive = i === selectedAnswerIdx;
            const isAbsent = a.isAbsent === true;
            const TypeIcon = QUESTION_TYPE_ICON[a.questionType];
            const statusClass = isAbsent
              ? mini.statusEmpty
              : a.score !== null
                ? mini.statusDone
                : mini.statusPending;
            return (
              <div
                key={a.id}
                className={`${styles.sidebarItem} ${isActive ? mini.statusActive : ""} ${statusClass}`}
                onClick={isAbsent ? undefined : () => setSelectedAnswerIdx(i)}
                style={isAbsent ? { cursor: "default", opacity: 0.7 } : undefined}
              >
                <div className={styles.sidebarLeading}>
                  <TypeIcon size={14} className={styles.sidebarTypeIcon} />
                  <div className={styles.sidebarLabel}>Q{a.questionIndex}</div>
                </div>
                {isAbsent ? (
                  <Tag type="warm-gray" size="sm">{t("grading.absent", "缺交")}</Tag>
                ) : a.score !== null ? (
                  <Tag type="green" size="sm">{a.score}/{a.maxScore}</Tag>
                ) : (
                  <Tag type="warm-gray" size="sm">{t("grading.ungraded", "未批")}</Tag>
                )}
              </div>
            );
          })
        ) : (
          <div className={styles.emptyStateCompact}>
            {activeSelectedStudentId
              ? t("grading.noSubmissions", "此學生尚未提交任何作答")
              : t("grading.selectStudentToGrade", "選擇一位學生來查看其所有作答")}
          </div>
        )}
      </div>
      <div className={styles.listFooter}>
        <span>
          {t("grading.questionsCount", "{{count}} 題", {
            count: currentStudentAnswers.length,
          })}
        </span>
        <span>
          {selectedStudentSummary
            ? `${selectedStudentSummary.gradedCount}/${selectedStudentSummary.totalCount} ${t("grading.complete", "完成")}`
            : `0/0 ${t("grading.complete", "完成")}`}
        </span>
      </div>
    </div>
  );

  return (
    <AdminSplitLayout
      sidebar={sidebarContent}
      sidebarWidth={GRADING_PRIMARY_LIST_WIDTH}
      middlePane={middlePaneContent}
      middlePaneWidth={
        isQuestionPaneCollapsed ? GRADING_COLLAPSED_LIST_WIDTH : GRADING_SECONDARY_LIST_WIDTH
      }
      contentClassName={styles.gradingContent}
    >
      <div className={styles.panel}>
        {activeSelectedStudentId && hasAnySubmission ? (
          <GradingSplitPanelScreen
            answer={currentAnswer}
            onGrade={onGrade}
            flowMode="byStudent"
            onNextQuestion={handleNext}
            hasNextQuestion={hasNext}
            onNextStudent={handleNextStudent}
            hasNextStudent={hasNextStudent}
            contextPath={{
              primary: selectedStudentSummary
                ? `${selectedStudentSummary.nickname} (${selectedStudentSummary.username})`
                : t("grading.student", "學生"),
              secondary: currentAnswer
                ? `Q${currentAnswer.questionIndex}`
                : undefined,
            }}
          />
        ) : (
          <div className={styles.panelEmpty}>
            {activeSelectedStudentId
              ? t("grading.noSubmissions", "此學生尚未提交任何作答")
              : t("grading.selectStudentToGrade", "選擇一位學生來查看其所有作答")}
          </div>
        )}
      </div>
    </AdminSplitLayout>
  );
}
