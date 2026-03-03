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
  students: { studentId: string; username: string; nickname: string }[];
  onGrade: (answerId: string, score: number, feedback: string) => void;
  searchQuery: string;
  filter: GradingFilter;
}

export default function GradingByQuestionTab({
  questionProgress,
  answersByQuestion,
  students,
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
              const isAbsent = a.isAbsent === true;
              return (
                <div
                  key={a.id}
                  className={`${styles.answerCard} ${isSelected ? styles.answerCardActive : ""}`}
                  onClick={isAbsent ? undefined : () => setSelectedAnswerId(a.id)}
                  style={isAbsent ? { cursor: "default", opacity: 0.7 } : undefined}
                >
                  <div className={styles.cardPrimary}>
                    <span>{a.studentNickname}</span>
                    {isAbsent ? (
                      <Tag type="red" size="sm">缺交</Tag>
                    ) : a.score !== null ? (
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
                      {isAbsent ? "" : a.gradedBy === "system" ? (
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
