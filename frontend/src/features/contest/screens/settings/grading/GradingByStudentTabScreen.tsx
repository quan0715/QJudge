import { useState, useMemo, useCallback, useEffect } from "react";
import { Button, Tag } from "@carbon/react";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  FlagFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import {
  ListPanel,
  ListHeader,
  ListFooter,
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
  ListItemTrailing,
} from "@/shared/ui/list/ListPanel";
import { EmptyState } from "@/shared/ui/EmptyState";
import GradingSplitPanelScreen from "./GradingSplitPanelScreen";
import {
  GRADING_COLLAPSED_LIST_WIDTH,
  GRADING_PRIMARY_LIST_WIDTH,
  GRADING_SECONDARY_LIST_WIDTH,
  type GradingAnswerRow,
  type QuestionProgress,
} from "./gradingTypes";
import {
  computeEffectiveMaxTotal,
  computeStudentDisplayTotal,
  isCountedQuestion,
} from "./scorePolicyUtils";
import { formatScore } from "@/features/contest/utils/scoreFormat";
import styles from "./GradingByStudent.module.scss";
import mini from "./GradingMini.module.scss";

interface StudentSummary {
  studentId: string;
  username: string;
  displayName: string;
  totalScore: number;
  maxPossible: number;
  gradedCount: number;
  totalCount: number;
}

interface GradingByStudentTabScreenProps {
  answersByStudent: Map<string, GradingAnswerRow[]>;
  questionProgress: QuestionProgress[];
  students: {
    studentId: string;
    username: string;
    displayName?: string;
  }[];
  onGrade: (answerId: string, score: number, feedback: string) => void;
  onUngrade?: (answerId: string) => void;
  flaggedIds?: Set<string>;
  onToggleFlag?: (answerId: string) => void;
  searchQuery: string;
  selectedStudentId: string | null;
  onSelectedStudentIdChange: (studentId: string | null) => void;
  readOnly?: boolean;
}

export default function GradingByStudentTabScreen({
  answersByStudent,
  questionProgress,
  students,
  onGrade,
  onUngrade,
  flaggedIds,
  onToggleFlag,
  searchQuery,
  selectedStudentId,
  onSelectedStudentIdChange,
  readOnly = false,
}: GradingByStudentTabScreenProps) {
  const { t } = useTranslation("contest");
  const [isQuestionPaneCollapsed, setIsQuestionPaneCollapsed] = useState(false);
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState(0);
  const orderedQuestions = useMemo(
    () => [...questionProgress].sort((left, right) => left.questionIndex - right.questionIndex),
    [questionProgress],
  );

  const studentSummaries = useMemo<StudentSummary[]>(() => {
    // Build maxPossible from question list (not answers) to handle missing answers correctly
    const maxPossible = computeEffectiveMaxTotal(
      orderedQuestions.map((q) => ({
        maxScore: q.maxScore,
        effectiveMaxScore: q.effectiveMaxScore,
        scorePolicy: q.scorePolicy,
      })),
    );

    return students.map((s) => {
      const answers = answersByStudent.get(s.studentId) ?? [];
      const gradedCount = answers.filter((a) => a.score !== null && isCountedQuestion(a.scorePolicy)).length;
      const totalScore = computeStudentDisplayTotal(
        answers.map((a) => ({
          maxScore: a.maxScore,
          effectiveMaxScore: a.effectiveMaxScore,
          scorePolicy: a.scorePolicy,
          score: a.score,
        })),
      );
      return {
        studentId: s.studentId,
        username: s.username,
        displayName: s.displayName || s.username,
        totalScore,
        maxPossible,
        gradedCount,
        totalCount: answers.filter((a) => isCountedQuestion(a.scorePolicy)).length,
      };
    });
  }, [students, answersByStudent]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return studentSummaries;
    const q = searchQuery.toLowerCase().trim();
    return studentSummaries.filter(
      (s) =>
        s.username.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q)
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
          studentDisplayName: activeStudent?.displayName ?? "",
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
    <ListPanel
      header={<ListHeader title={t("grading.studentList", "學生列表")} />}
      footer={
        <ListFooter>
          {t("grading.studentsDisplayCount", "顯示 {{shown}} / {{total}} 位", {
            shown: filtered.length,
            total: students.length,
          })}
        </ListFooter>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState
          title={searchQuery.trim()
            ? t("grading.noMatchingStudents", "沒有符合搜尋條件的學生")
            : t("grading.noStudents", "尚無學生資料")}
          compact
        />
      ) : (
        filtered.map((s) => (
          <ListItem
            key={s.studentId}
            testId={`grading-student-row-${s.studentId}`}
            active={s.studentId === activeSelectedStudentId}
            onClick={() => handleStudentSelect(s.studentId)}
          >
            <ListItemContent>
              <ListItemTitle>{s.displayName || s.username}</ListItemTitle>
              {s.displayName && s.displayName !== s.username && (
                <ListItemMeta>{s.username}</ListItemMeta>
              )}
            </ListItemContent>
            <ListItemTrailing>
              {s.totalCount === 0 ? (
                <Tag type="red" size="sm">{t("grading.absent", "缺交")}</Tag>
              ) : (
                <span style={{ color: s.gradedCount === s.totalCount ? "var(--cds-support-success)" : "var(--cds-text-secondary)", fontWeight: 600, fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                  {s.gradedCount}/{s.totalCount}
                </span>
              )}
            </ListItemTrailing>
          </ListItem>
        ))
      )}
    </ListPanel>
  );

  const middlePaneContent = isQuestionPaneCollapsed ? (
    <ListPanel
      header={
        <ListHeader
          title=""
          action={
            <button
              type="button"
              onClick={() => setIsQuestionPaneCollapsed(false)}
              aria-label={t("grading.expandQuestionList", "展開題目列表")}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--cds-icon-primary)" }}
            >
              <ChevronRight size={16} />
            </button>
          }
        />
      }
      footer={<ListFooter>&nbsp;</ListFooter>}
    >
      {activeSelectedStudentId && currentStudentAnswers.length > 0 ? (
        currentStudentAnswers.map((answer, idx) => {
          const statusClass = answer.isAbsent
            ? mini.statusEmpty
            : answer.score !== null
              ? mini.statusDone
              : mini.statusPending;
          return (
            <ListItem
              key={answer.id}
              size="compact"
              active={idx === selectedAnswerIdx}
              onClick={answer.isAbsent ? undefined : () => setSelectedAnswerIdx(idx)}
              className={`${idx === selectedAnswerIdx ? mini.statusActive : ""} ${statusClass}`}
            >
              Q{answer.questionIndex}
            </ListItem>
          );
        })
      ) : null}
    </ListPanel>
  ) : (
    <ListPanel
      header={
        <ListHeader
          title={t("grading.questionList", "題目列表")}
          action={
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription={t("grading.collapseQuestionList", "收摺題目列表")}
              onClick={() => setIsQuestionPaneCollapsed(true)}
            />
          }
        />
      }
      footer={
        <ListFooter>
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
        </ListFooter>
      }
    >
      {activeSelectedStudentId && currentStudentAnswers.length > 0 ? (
        currentStudentAnswers.map((a, i) => {
          const isActive = i === selectedAnswerIdx;
          const isAbsent = a.isAbsent === true;
          const TypeIcon = EXAM_QUESTION_TYPE_ICON[a.questionType];
          const statusClass = isAbsent
            ? mini.statusEmpty
            : a.score !== null
              ? mini.statusDone
              : mini.statusPending;
          return (
            <ListItem
              key={a.id}
              active={isActive}
              onClick={isAbsent ? undefined : () => setSelectedAnswerIdx(i)}
              className={`${isActive ? mini.statusActive : ""} ${statusClass}`}
            >
              <ListItemLeading>
                <TypeIcon size={14} className={styles.sidebarTypeIcon} />
              </ListItemLeading>
              <ListItemContent>
                <ListItemTitle>Q{a.questionIndex}</ListItemTitle>
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
                  <Tag type="warm-gray" size="sm">{t("grading.absent", "缺交")}</Tag>
                ) : readOnly ? (
                  <Tag type="cool-gray" size="sm">{a.latestSubmissionStatus || t("grading.answered", "已作答")}</Tag>
                ) : a.score !== null ? (
                  <Tag type="green" size="sm">
                    {formatScore(a.score)}/{formatScore(a.maxScore)}
                  </Tag>
                ) : (
                  <Tag type="warm-gray" size="sm">{t("grading.ungraded", "未批")}</Tag>
                )}
              </ListItemTrailing>
            </ListItem>
          );
        })
      ) : (
        <EmptyState
          title={activeSelectedStudentId
            ? t("grading.noSubmissions", "此學生尚未提交任何作答")
            : t("grading.selectStudentToGrade", "選擇一位學生來查看其所有作答")}
          compact
        />
      )}
    </ListPanel>
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
      mobileMode="stacked"
    >
      <div className={styles.panel}>
        {activeSelectedStudentId && hasAnySubmission ? (
          <GradingSplitPanelScreen
            answer={currentAnswer}
            onGrade={onGrade}
            onUngrade={onUngrade}
            isFlagged={currentAnswer ? flaggedIds?.has(currentAnswer.id) : false}
            onToggleFlag={onToggleFlag}
            flowMode="byStudent"
            readOnly={readOnly}
            onNextQuestion={handleNext}
            hasNextQuestion={hasNext}
            onNextStudent={handleNextStudent}
            hasNextStudent={hasNextStudent}
            contextPath={{
              primary: selectedStudentSummary
                ? `${selectedStudentSummary.displayName} (${selectedStudentSummary.username})`
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
