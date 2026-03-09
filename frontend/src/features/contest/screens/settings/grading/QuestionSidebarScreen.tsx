import { useTranslation } from "react-i18next";
import type { QuestionProgress } from "./gradingTypes";
import styles from "./GradingByQuestion.module.scss";

interface QuestionSidebarScreenProps {
  questions: QuestionProgress[];
  selectedQuestionId: string | null;
  onSelect: (questionId: string) => void;
}

export default function QuestionSidebarScreen({
  questions,
  selectedQuestionId,
  onSelect,
}: QuestionSidebarScreenProps) {
  const { t } = useTranslation("contest");
  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>{t("grading.questionList")}</div>
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
                {t(`common:questionType.label.${q.questionType}`, q.questionType)}
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
