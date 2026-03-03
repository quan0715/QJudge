import { useState, useMemo, useEffect, useCallback } from "react";
import { Pagination, Tag } from "@carbon/react";
import GradingSplitPanel from "./GradingSplitPanelScreen";
import type { GradingAnswerRow } from "./gradingTypes";
import styles from "./ContestExamGrading.module.scss";

interface StudentSummary {
  studentId: string;
  username: string;
  nickname: string;
  totalScore: number;
  maxPossible: number;
  gradedCount: number;
  totalCount: number;
}

interface GradingByStudentTabProps {
  answersByStudent: Map<string, GradingAnswerRow[]>;
  students: { studentId: string; username: string; nickname: string }[];
  onGrade: (answerId: string, score: number, feedback: string) => void;
  searchQuery: string;
}

export default function GradingByStudentTab({
  answersByStudent,
  students,
  onGrade,
  searchQuery,
}: GradingByStudentTabProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null
  );
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  // Reset page on search change
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const startIndex = (page - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  const currentStudentAnswers = useMemo(
    () =>
      selectedStudentId
        ? (answersByStudent.get(selectedStudentId) ?? [])
        : [],
    [answersByStudent, selectedStudentId]
  );

  const currentAnswer = currentStudentAnswers[selectedAnswerIdx] ?? null;
  const hasNext = selectedAnswerIdx < currentStudentAnswers.length - 1;

  // Find next student in filtered list
  const currentStudentFilteredIdx = useMemo(() => {
    if (!selectedStudentId) return -1;
    return filtered.findIndex((s) => s.studentId === selectedStudentId);
  }, [filtered, selectedStudentId]);

  const hasNextStudent = currentStudentFilteredIdx >= 0 && currentStudentFilteredIdx < filtered.length - 1;

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSelectedAnswerIdx(0);
  };

  const handleNext = () => {
    if (hasNext) setSelectedAnswerIdx((i) => i + 1);
  };

  const handleNextStudent = useCallback(() => {
    if (!hasNextStudent) return;
    const nextStudent = filtered[currentStudentFilteredIdx + 1];
    setSelectedStudentId(nextStudent.studentId);
    setSelectedAnswerIdx(0);
  }, [filtered, currentStudentFilteredIdx, hasNextStudent]);

  return (
    <div className={styles.threeColStudent}>
      {/* Left: Student card list */}
      <div className={styles.twoColLeft}>
        <div className={styles.cardList}>
          {paginated.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateDesc}>
                {searchQuery.trim()
                  ? "沒有符合搜尋條件的學生"
                  : "尚無學生資料"}
              </span>
            </div>
          ) : (
            paginated.map((s) => {
              const isSelected = s.studentId === selectedStudentId;
              return (
                <div
                  key={s.studentId}
                  className={`${styles.answerCard} ${isSelected ? styles.answerCardActive : ""}`}
                  onClick={() => handleStudentSelect(s.studentId)}
                >
                  <div className={styles.cardPrimary}>
                    <span>{s.nickname}</span>
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
                      <Tag type="red" size="sm">缺交</Tag>
                    ) : s.gradedCount === s.totalCount ? (
                      <Tag type="green" size="sm">完成</Tag>
                    ) : (
                      <span>{s.gradedCount}/{s.totalCount} 完成</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Pagination
          totalItems={filtered.length}
          backwardText="上一頁"
          forwardText="下一頁"
          itemsPerPageText="每頁"
          page={page}
          pageSize={pageSize}
          pageSizes={[25, 50, 100]}
          onChange={({
            page: p,
            pageSize: ps,
          }: {
            page: number;
            pageSize: number;
          }) => {
            setPage(p);
            setPageSize(ps);
          }}
        />
      </div>

      {/* Middle: Question sidebar */}
      <div className={styles.questionSidebar}>
        {selectedStudentId && currentStudentAnswers.length > 0 ? (
          <>
            <div className={styles.sidebarHeader}>題目</div>
            {currentStudentAnswers.map((a, i) => {
              const isActive = i === selectedAnswerIdx;
              return (
                <div
                  key={a.id}
                  className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ""}`}
                  onClick={() => setSelectedAnswerIdx(i)}
                >
                  <span className={styles.sidebarLabel}>Q{a.questionIndex}</span>
                  {a.score !== null ? (
                    <Tag type="green" size="sm">{a.score}/{a.maxScore}</Tag>
                  ) : (
                    <Tag type="warm-gray" size="sm">未批</Tag>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <div className={styles.sidebarHeader}>題目</div>
        )}
      </div>

      {/* Right: Grading panel */}
      <div className={styles.panel}>
        {selectedStudentId && currentStudentAnswers.length > 0 ? (
          <GradingSplitPanel
            answer={currentAnswer}
            onGrade={onGrade}
            onNext={handleNext}
            hasNext={hasNext}
            onNextStudent={handleNextStudent}
            hasNextStudent={hasNextStudent}
          />
        ) : (
          <div className={styles.panelEmpty}>
            {selectedStudentId
              ? "此學生尚未提交任何作答"
              : "選擇一位學生來查看其所有作答"}
          </div>
        )}
      </div>
    </div>
  );
}
