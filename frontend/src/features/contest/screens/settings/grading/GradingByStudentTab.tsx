import { useState, useMemo } from "react";
import { Pagination, Tag } from "@carbon/react";
import GradingSplitPanel from "./GradingSplitPanel";
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
  useMemo(() => setPage(1), [searchQuery]);

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

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSelectedAnswerIdx(0);
  };

  const handleNext = () => {
    if (hasNext) setSelectedAnswerIdx((i) => i + 1);
  };

  return (
    <div className={styles.twoCol}>
      {/* Left: Student card list */}
      <div className={styles.twoColLeft}>
        <div className={styles.cardList}>
          {paginated.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateDesc}>
                {searchQuery.trim()
                  ? "沒有符合搜尋條件的學生"
                  : "尚無學生作答資料"}
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
                    {s.gradedCount === s.totalCount ? (
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

      {/* Right: Grading panel */}
      <div className={styles.panel}>
        {selectedStudentId && currentStudentAnswers.length > 0 ? (
          <>
            <div className={styles.answerNav}>
              {currentStudentAnswers.map((a, i) => (
                <Tag
                  key={a.id}
                  type={
                    i === selectedAnswerIdx
                      ? "high-contrast"
                      : a.score !== null
                        ? "green"
                        : "warm-gray"
                  }
                  size="sm"
                  onClick={() => setSelectedAnswerIdx(i)}
                  style={{ cursor: "pointer" }}
                >
                  Q{a.questionIndex}
                </Tag>
              ))}
            </div>
            <GradingSplitPanel
              answer={currentAnswer}
              onGrade={onGrade}
              onNext={handleNext}
              hasNext={hasNext}
            />
          </>
        ) : (
          <div className={styles.panelEmpty}>
            選擇一位學生來查看其所有作答
          </div>
        )}
      </div>
    </div>
  );
}
