import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { GradingAnswerRow, QuestionProgress } from "./gradingTypes";
import styles from "./GradingMatrixView.module.scss";

interface GradingMatrixViewScreenProps {
  questionProgress: QuestionProgress[];
  students: {
    studentId: string;
    username: string;
    nickname: string;
    displayName?: string;
  }[];
  answersByQuestion: Map<string, GradingAnswerRow[]>;
  onSelectCell: (questionId: string, studentId: string) => void;
}

type CellState = "graded" | "pending" | "empty";

export default function GradingMatrixViewScreen({
  questionProgress,
  students,
  answersByQuestion,
  onSelectCell,
}: GradingMatrixViewScreenProps) {
  const { t } = useTranslation("contest");
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [focusedCell, setFocusedCell] = useState({ row: 0, col: 0 });

  const answerLookup = useMemo(() => {
    const lookup = new Map<string, GradingAnswerRow>();
    for (const [questionId, rows] of answersByQuestion.entries()) {
      rows.forEach((row) => {
        lookup.set(`${questionId}:${row.studentId}`, row);
      });
    }
    return lookup;
  }, [answersByQuestion]);

  const studentTotalScore = useMemo(() => {
    const scoreMap = new Map<string, number>();
    students.forEach((student) => {
      let total = 0;
      questionProgress.forEach((question) => {
        const answer = answerLookup.get(`${question.questionId}:${student.studentId}`);
        if (answer?.score !== null && answer?.score !== undefined) {
          total += answer.score;
        }
      });
      scoreMap.set(student.studentId, total);
    });
    return scoreMap;
  }, [students, questionProgress, answerLookup]);

  const questionAverageScore = useMemo(() => {
    const scoreMap = new Map<string, number | null>();
    questionProgress.forEach((question) => {
      let sum = 0;
      let gradedCount = 0;
      students.forEach((student) => {
        const row = answerLookup.get(`${question.questionId}:${student.studentId}`);
        if (row?.score !== null && row?.score !== undefined) {
          sum += row.score;
          gradedCount += 1;
        }
      });
      scoreMap.set(question.questionId, gradedCount > 0 ? sum / gradedCount : null);
    });
    return scoreMap;
  }, [questionProgress, students, answerLookup]);

  const averageTotalScore = useMemo(() => {
    if (students.length === 0) return null;
    let total = 0;
    students.forEach((student) => {
      total += studentTotalScore.get(student.studentId) ?? 0;
    });
    return total / students.length;
  }, [students, studentTotalScore]);

  const formatScore = (value: number | null) => {
    if (value === null) return "-";
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  };

  const matrixSummary = useMemo(() => {
    let graded = 0;
    let pending = 0;
    let empty = 0;
    students.forEach((student) => {
      questionProgress.forEach((question) => {
        const row = answerLookup.get(`${question.questionId}:${student.studentId}`);
        if (!row) {
          empty += 1;
          return;
        }
        if (row.score === null) {
          pending += 1;
        } else {
          graded += 1;
        }
      });
    });
    return { graded, pending, empty };
  }, [students, questionProgress, answerLookup]);

  useEffect(() => {
    setFocusedCell((prev) => ({
      row: Math.max(0, Math.min(prev.row, students.length - 1)),
      col: Math.max(0, Math.min(prev.col, questionProgress.length - 1)),
    }));
  }, [students.length, questionProgress.length]);

  const focusCell = (row: number, col: number) => {
    const target = gridRef.current?.querySelector<HTMLButtonElement>(
      `button[data-row="${row}"][data-col="${col}"]`,
    );
    if (!target) return;
    target.focus();
    setFocusedCell({ row, col });
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number,
    questionId: string,
    studentId: string,
  ) => {
    const maxRow = students.length - 1;
    const maxCol = questionProgress.length - 1;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        focusCell(Math.max(0, row - 1), col);
        return;
      case "ArrowDown":
        event.preventDefault();
        focusCell(Math.min(maxRow, row + 1), col);
        return;
      case "ArrowLeft":
        event.preventDefault();
        focusCell(row, Math.max(0, col - 1));
        return;
      case "ArrowRight":
        event.preventDefault();
        focusCell(row, Math.min(maxCol, col + 1));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelectCell(questionId, studentId);
        return;
      default:
        return;
    }
  };

  if (students.length === 0 || questionProgress.length === 0) {
    return (
      <div className={styles.emptyState}>
        {t("grading.matrixEmpty", "目前資料不足，無法顯示矩陣總覽。")}
      </div>
    );
  }

  const colCount = questionProgress.length;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.summary}>
          <span>{t("grading.matrixGradedCount", "已批改 {{count}}", { count: matrixSummary.graded })}</span>
          <span>{t("grading.matrixPendingCount", "待批改 {{count}}", { count: matrixSummary.pending })}</span>
          <span>{t("grading.matrixEmptyCount", "未作答 {{count}}", { count: matrixSummary.empty })}</span>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.graded}`} />
            {t("grading.matrixLegendGraded", "已批改")}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.pending}`} />
            {t("grading.matrixLegendPending", "待批改")}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.empty}`} />
            {t("grading.matrixLegendEmpty", "未作答")}
          </span>
        </div>
      </div>

      <div className={styles.scroller} ref={gridRef}>
        <div
          className={styles.grid}
          role="grid"
          aria-rowcount={students.length + 2}
          aria-colcount={colCount + 1}
          style={{ "--col-count": colCount } as CSSProperties}
        >
          {/* ── Header row ── */}
          <div
            className={`${styles.gridCell} ${styles.frozenCorner}`}
            role="columnheader"
          >
            {t("grading.student", "學生")}
          </div>
          {questionProgress.map((q) => (
            <div
              key={q.questionId}
              className={`${styles.gridCell} ${styles.colHeaderCell}`}
              role="columnheader"
            >
              Q{q.questionIndex}
            </div>
          ))}

          {/* ── Body rows ── */}
          {students.map((student, rowIndex) => {
            const username = (student.username && student.username.trim()) || student.studentId;
            const displayNameCandidate =
              (student.displayName && student.displayName.trim()) ||
              (student.nickname && student.nickname.trim()) ||
              "";
            const displayName =
              displayNameCandidate && displayNameCandidate !== username
                ? displayNameCandidate
                : null;
            const score = studentTotalScore.get(student.studentId) ?? 0;
            const scoreDisplay = Number.isInteger(score) ? String(score) : score.toFixed(1);

            return (
              <div key={student.studentId} role="row" style={{ display: "contents" }}>
                {/* Frozen student cell */}
                <div
                  className={`${styles.gridCell} ${styles.frozenCol}`}
                  role="rowheader"
                  title={displayName ? `${username} (${displayName})` : username}
                >
                  <div className={styles.studentHeader}>
                    <div className={styles.studentIdentity}>
                      <div className={styles.studentUsername}>{username}</div>
                      {displayName ? (
                        <div className={styles.studentDisplayName}>{displayName}</div>
                      ) : null}
                    </div>
                    <div className={styles.studentScore}>{scoreDisplay}</div>
                  </div>
                </div>

                {/* Data cells */}
                {questionProgress.map((question, colIndex) => {
                  const row = answerLookup.get(`${question.questionId}:${student.studentId}`);
                  const cellState: CellState = !row
                    ? "empty"
                    : row.score === null
                      ? "pending"
                      : "graded";
                  const cellValue = cellState === "graded" ? `${row?.score ?? 0}` : "";
                  const cellTitle =
                    cellState === "graded"
                      ? t("grading.matrixCellGraded", "已批改：{{score}} / {{max}}", {
                          score: row?.score ?? 0,
                          max: row?.maxScore ?? question.maxScore,
                        })
                      : cellState === "pending"
                        ? t("grading.matrixCellPending", "已作答，待批改")
                        : t("grading.matrixCellEmpty", "未作答");
                  const scoreRatio =
                    cellState === "graded" && row && row.maxScore > 0
                      ? Math.max(0, Math.min(1, (row.score ?? 0) / row.maxScore))
                      : 0;
                  const heatPercent = `${Math.round(8 + scoreRatio * 28)}%`;
                  const cellStyle =
                    cellState === "graded"
                      ? ({ "--cell-heat": heatPercent } as CSSProperties)
                      : undefined;

                  return (
                    <div
                      key={`${student.studentId}:${question.questionId}`}
                      className={`${styles.gridCell} ${styles.dataCell}`}
                      role="gridcell"
                    >
                      <button
                        type="button"
                        className={`${styles.cell} ${styles[cellState]}`}
                        title={cellTitle}
                        aria-label={`${username} Q${question.questionIndex}: ${cellTitle}`}
                        data-testid={`matrix-cell-${rowIndex}-${colIndex}`}
                        data-row={rowIndex}
                        data-col={colIndex}
                        tabIndex={focusedCell.row === rowIndex && focusedCell.col === colIndex ? 0 : -1}
                        onFocus={() => setFocusedCell({ row: rowIndex, col: colIndex })}
                        onKeyDown={(e) =>
                          handleCellKeyDown(e, rowIndex, colIndex, question.questionId, student.studentId)
                        }
                        onClick={() => onSelectCell(question.questionId, student.studentId)}
                        style={cellStyle}
                      >
                        {cellState === "pending" ? (
                          <span className={styles.pendingDot} aria-hidden />
                        ) : (
                          cellValue
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div role="row" style={{ display: "contents" }}>
            <div
              className={`${styles.gridCell} ${styles.frozenCol} ${styles.summaryRowHeader}`}
              role="rowheader"
              data-testid="matrix-summary-label"
            >
              <div className={styles.studentHeader}>
                <div className={styles.studentUsername}>
                  {t("grading.matrixSummaryRow", "總和（平均）")}
                </div>
                <div className={styles.studentScore}>
                  <span data-testid="matrix-summary-total">
                    {formatScore(averageTotalScore)}
                  </span>
                </div>
              </div>
            </div>
            {questionProgress.map((question, index) => (
              <div
                key={`summary:${question.questionId}`}
                className={`${styles.gridCell} ${styles.dataCell} ${styles.summaryDataCell}`}
                role="gridcell"
                data-testid={`matrix-summary-cell-${index}`}
              >
                <span className={styles.summaryCellValue}>
                  {formatScore(questionAverageScore.get(question.questionId) ?? null)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
