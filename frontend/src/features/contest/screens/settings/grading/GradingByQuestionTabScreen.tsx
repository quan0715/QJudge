import { useState, useMemo, useEffect } from "react";
import { Pagination, Tag } from "@carbon/react";
import QuestionSidebar from "./QuestionSidebarScreen";
import GradingSplitPanel from "./GradingSplitPanelScreen";
import type {
  GradingAnswerRow,
  QuestionProgress,
  GradingFilter,
} from "./gradingTypes";
import styles from "./ContestExamGrading.module.scss";

interface GradingByQuestionTabProps {
  questionProgress: QuestionProgress[];
  answersByQuestion: Map<string, GradingAnswerRow[]>;
  onGrade: (answerId: string, score: number, feedback: string) => void;
  searchQuery: string;
  filter: GradingFilter;
}

export default function GradingByQuestionTab({
  questionProgress,
  answersByQuestion,
  onGrade,
  searchQuery,
  filter,
}: GradingByQuestionTabProps) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    questionProgress[0]?.questionId ?? ""
  );
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Current question's answers (filtered + searched)
  const currentAnswers = useMemo(() => {
    let rows = answersByQuestion.get(selectedQuestionId) ?? [];

    if (filter === "graded") rows = rows.filter((r) => r.score !== null);
    if (filter === "ungraded") rows = rows.filter((r) => r.score === null);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.studentUsername.toLowerCase().includes(q) ||
          r.studentNickname.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [answersByQuestion, selectedQuestionId, filter, searchQuery]);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filter]);

  const startIndex = (page - 1) * pageSize;
  const paginatedAnswers = currentAnswers.slice(
    startIndex,
    startIndex + pageSize
  );

  const selectedAnswer = useMemo(
    () =>
      selectedAnswerId
        ? (answersByQuestion
            .get(selectedQuestionId)
            ?.find((a) => a.id === selectedAnswerId) ?? null)
        : null,
    [answersByQuestion, selectedQuestionId, selectedAnswerId]
  );

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
    setPage(1);
  };

  const handleNext = () => {
    const nextId = findNextUngraded();
    if (nextId) setSelectedAnswerId(nextId);
  };

  const hasNext = !!findNextUngraded();

  return (
    <div className={styles.threeCol}>
      {/* Left: Question sidebar */}
      <QuestionSidebar
        questions={questionProgress}
        selectedQuestionId={selectedQuestionId}
        onSelect={handleQuestionSelect}
      />

      {/* Middle: Answer card list */}
      <div className={styles.tableCol}>
        <div className={styles.cardList}>
          {paginatedAnswers.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateDesc}>
                {searchQuery.trim() || filter !== "all"
                  ? "沒有符合條件的作答"
                  : "此題目尚無學生作答"}
              </span>
            </div>
          ) : (
            paginatedAnswers.map((a) => {
              const isSelected = a.id === selectedAnswerId;
              return (
                <div
                  key={a.id}
                  className={`${styles.answerCard} ${isSelected ? styles.answerCardActive : ""}`}
                  onClick={() => setSelectedAnswerId(a.id)}
                >
                  <div className={styles.cardPrimary}>
                    <span>{a.studentNickname}</span>
                    {a.score !== null ? (
                      <span style={{ fontWeight: 600, color: "var(--cds-support-success)" }}>
                        {a.score}/{a.maxScore}
                      </span>
                    ) : (
                      <Tag type="warm-gray" size="sm">未批改</Tag>
                    )}
                  </div>
                  <div className={styles.cardSecondary}>
                    <span>{a.studentUsername}</span>
                    <span>
                      {a.gradedBy === "system" ? (
                        <Tag type="cyan" size="sm">自動</Tag>
                      ) : a.gradedBy ?? ""}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Pagination
          totalItems={currentAnswers.length}
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
      <GradingSplitPanel
        answer={selectedAnswer}
        onGrade={onGrade}
        onNext={handleNext}
        hasNext={hasNext}
      />
    </div>
  );
}
