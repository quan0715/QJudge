import type { QuestionProgress } from "./gradingTypes";
import { questionTypeLabel } from "./gradingTypes";
import styles from "./ContestExamGrading.module.scss";

interface QuestionSidebarProps {
  questions: QuestionProgress[];
  selectedQuestionId: string | null;
  onSelect: (questionId: string) => void;
}

export default function QuestionSidebar({
  questions,
  selectedQuestionId,
  onSelect,
}: QuestionSidebarProps) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>題目列表</div>
      {questions.map((q) => {
        const isActive = q.questionId === selectedQuestionId;
        return (
          <div
            key={q.questionId}
            className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ""}`}
            onClick={() => onSelect(q.questionId)}
          >
            <div>
              <div className={styles.sidebarLabel}>Q{q.questionIndex}</div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--cds-text-secondary)",
                  marginTop: "2px",
                }}
              >
                {questionTypeLabel[q.questionType]}
              </div>
            </div>
            <span
              className={styles.sidebarProgress}
              style={{
                color:
                  q.progressPercent === 100
                    ? "var(--cds-support-success)"
                    : "var(--cds-text-secondary)",
              }}
            >
              {q.isObjective ? "✓" : `${q.progressPercent}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
