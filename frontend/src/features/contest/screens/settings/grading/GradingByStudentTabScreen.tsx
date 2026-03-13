import { useState, useMemo, useCallback, useEffect } from "react";
import { Button, Tag } from "@carbon/react";
import { ChevronLeft, ChevronRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import GradingSplitPanelScreen from "./GradingSplitPanelScreen";
import {
  GRADING_COLLAPSED_LIST_WIDTH,
  GRADING_PRIMARY_LIST_WIDTH,
  GRADING_SECONDARY_LIST_WIDTH,
  type GradingAnswerRow,
} from "./gradingTypes";
import styles from "./GradingByStudent.module.scss";

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
  students: { studentId: string; username: string; nickname: string }[];
  onGrade: (answerId: string, score: number, feedback: string) => void;
  searchQuery: string;
  selectedStudentId: string | null;
  onSelectedStudentIdChange: (studentId: string | null) => void;
}

export default function GradingByStudentTabScreen({
  answersByStudent,
  students,
  onGrade,
  searchQuery,
  selectedStudentId,
  onSelectedStudentIdChange,
}: GradingByStudentTabScreenProps) {
  const { t } = useTranslation("contest");
  const [isStudentPaneCollapsed, setIsStudentPaneCollapsed] = useState(false);
  const [isQuestionPaneCollapsed, setIsQuestionPaneCollapsed] = useState(false);
  const [hoveredStudentId, setHoveredStudentId] = useState<string | null>(null);
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState(0);

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

  const currentStudentAnswers = useMemo(
    () =>
      activeSelectedStudentId
        ? (answersByStudent.get(activeSelectedStudentId) ?? [])
        : [],
    [answersByStudent, activeSelectedStudentId]
  );

  const currentAnswer = currentStudentAnswers[selectedAnswerIdx] ?? null;
  const selectedStudentSummary = useMemo(
    () => filtered.find((student) => student.studentId === activeSelectedStudentId) ?? null,
    [filtered, activeSelectedStudentId],
  );
  const previewStudentSummary = useMemo(() => {
    const targetStudentId = hoveredStudentId ?? activeSelectedStudentId;
    if (!targetStudentId) {
      return null;
    }
    return filtered.find((student) => student.studentId === targetStudentId) ?? null;
  }, [hoveredStudentId, activeSelectedStudentId, filtered]);
  const hasNext = selectedAnswerIdx < currentStudentAnswers.length - 1;

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
    }
  }, [currentStudentAnswers, selectedAnswerIdx]);

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
    if (hasNext) setSelectedAnswerIdx((i) => i + 1);
  };

  const handleNextStudent = useCallback(() => {
    if (!hasNextStudent) return;
    const nextStudent = filtered[currentStudentFilteredIdx + 1];
    onSelectedStudentIdChange(nextStudent.studentId);
    setSelectedAnswerIdx(0);
  }, [filtered, currentStudentFilteredIdx, hasNextStudent, onSelectedStudentIdChange]);

  const sidebarContent = isStudentPaneCollapsed ? (
    <div className={styles.collapsedPane}>
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={ChevronRight}
        iconDescription={t("grading.expandStudentList", "展開學生列表")}
        onClick={() => setIsStudentPaneCollapsed(false)}
      />
    </div>
  ) : (
    <div className={styles.pane}>
      <div className={styles.paneHeaderRow}>
        <div className={styles.sidebarHeader}>{t("grading.studentList", "學生列表")}</div>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={ChevronLeft}
          iconDescription={t("grading.collapseStudentList", "收摺學生列表")}
          onClick={() => setIsStudentPaneCollapsed(true)}
        />
      </div>
      <div className={styles.listControls}>
        <div className={styles.toolbarMeta}>
          <span>
            {t("grading.studentsDisplayCount", "顯示 {{shown}} / {{total}} 位", {
              shown: filtered.length,
              total: students.length,
            })}
          </span>
        </div>
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
            const statusClass =
              s.totalCount === 0
                ? styles.statusEmpty
                : s.gradedCount === s.totalCount
                  ? styles.statusDone
                  : styles.statusPending;
            return (
              <div
                key={s.studentId}
                className={`${styles.answerCard} ${isSelected ? styles.answerCardActive : ""}`}
                onClick={() => handleStudentSelect(s.studentId)}
                onMouseEnter={() => setHoveredStudentId(s.studentId)}
                onMouseLeave={() => setHoveredStudentId(null)}
                onPointerEnter={() => setHoveredStudentId(s.studentId)}
                onPointerLeave={() => setHoveredStudentId(null)}
              >
                <div className={styles.cardPrimary}>
                  <span className={styles.cardLabelRow}>
                    <span className={`${styles.statusDot} ${statusClass}`} />
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
    </div>
  );

  const middlePaneContent = isQuestionPaneCollapsed ? (
    <div className={styles.collapsedPane}>
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={ChevronRight}
        iconDescription={t("grading.expandQuestionList", "展開題目列表")}
        onClick={() => setIsQuestionPaneCollapsed(false)}
      />
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
      {previewStudentSummary ? (
        <div className={styles.previewBar} aria-live="polite">
          {t(
            "grading.previewStudentSummary",
            "{{name}} · {{graded}}/{{total}} 完成 · {{score}} 分",
            {
              name: previewStudentSummary.nickname,
              graded: previewStudentSummary.gradedCount,
              total: previewStudentSummary.totalCount,
              score: previewStudentSummary.totalScore,
            },
          )}
        </div>
      ) : null}
      {activeSelectedStudentId && currentStudentAnswers.length > 0 ? (
        currentStudentAnswers.map((a, i) => {
          const isActive = i === selectedAnswerIdx;
          const statusClass = a.score !== null ? styles.statusDone : styles.statusPending;
          return (
            <div
              key={a.id}
              className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ""}`}
              onClick={() => setSelectedAnswerIdx(i)}
            >
              <span className={styles.cardLabelRow}>
                <span className={`${styles.statusDot} ${statusClass}`} />
                <span className={styles.sidebarLabel}>Q{a.questionIndex}</span>
              </span>
              {a.score !== null ? (
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
  );

  return (
    <AdminSplitLayout
      sidebar={sidebarContent}
      sidebarWidth={
        isStudentPaneCollapsed ? GRADING_COLLAPSED_LIST_WIDTH : GRADING_PRIMARY_LIST_WIDTH
      }
      middlePane={middlePaneContent}
      middlePaneWidth={
        isQuestionPaneCollapsed ? GRADING_COLLAPSED_LIST_WIDTH : GRADING_SECONDARY_LIST_WIDTH
      }
      contentClassName={styles.gradingContent}
    >
      <div className={styles.panel}>
        {activeSelectedStudentId && currentStudentAnswers.length > 0 ? (
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
