import { Checkmark } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type { ExamQuestionType } from "@/core/entities/contest.entity";
import { isSubjectiveType } from "@/features/contest/screens/settings/grading/gradingTypes";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";

import styles from "./AnswerDisplay.module.scss";

export interface AnswerDisplayProps {
  questionType: ExamQuestionType;
  answerContent: Record<string, unknown>;
  options: string[];
  correctAnswer: unknown;
}

/** Check whether a given option index is selected by the student. */
function isSelected(answerContent: Record<string, unknown>, idx: number): boolean {
  const selected = answerContent.selected;
  if (Array.isArray(selected)) return selected.includes(idx);
  return selected === idx;
}

/** Check whether a given option index is a correct answer. */
function isCorrect(correctAnswer: unknown, idx: number): boolean {
  if (correctAnswer == null) return false;
  if (Array.isArray(correctAnswer)) return correctAnswer.includes(idx);
  return correctAnswer === idx;
}

/** Format correct answer as label text. */
function formatCorrectLabel(correctAnswer: unknown, options: string[]): string {
  if (correctAnswer == null) return "";
  if (Array.isArray(correctAnswer)) {
    return correctAnswer
      .map((i) => `${String.fromCharCode(65 + Number(i))}. ${options[Number(i)] ?? ""}`)
      .join(", ");
  }
  const i = Number(correctAnswer);
  return `${String.fromCharCode(65 + i)}. ${options[i] ?? ""}`;
}

function getTextAnswer(answerContent: Record<string, unknown>): string {
  const text = answerContent.text;
  return typeof text === "string" ? text : "";
}

const AnswerDisplay: React.FC<AnswerDisplayProps> = ({
  questionType,
  answerContent,
  options,
  correctAnswer,
}) => {
  const { t } = useTranslation("contest");
  const subjective = isSubjectiveType(questionType);
  const hasOptions = options.length > 0;

  if (subjective) {
    const text = getTextAnswer(answerContent);
    return (
      <div className={styles.root}>
        <div className={styles.section}>
          <span className={styles.label}>{t("grading.answerContent", "作答內容")}</span>
          <div className={`${styles.fieldBase} ${styles.answerField}`}>
            {text ? (
              <MarkdownContent.Simple>{text}</MarkdownContent.Simple>
            ) : (
              <span className={styles.noAnswer}>{t("participantsDashboard.noAnswer", "未作答")}</span>
            )}
          </div>
        </div>
        {correctAnswer != null && typeof correctAnswer === "string" && (
          <div className={styles.section}>
            <span className={styles.label}>{t("grading.referenceAnswer", "參考答案")}</span>
            <div className={`${styles.fieldBase} ${styles.referenceField}`}>
              <MarkdownContent.Simple>{correctAnswer}</MarkdownContent.Simple>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!hasOptions) {
    return (
      <div className={styles.root}>
        <span className={styles.noAnswer}>{t("participantsDashboard.noAnswer", "未作答")}</span>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <span className={styles.label}>{t("grading.answerContent", "作答內容")}</span>
        <div className={styles.optionsList}>
          {options.map((opt, i) => {
            const selected = isSelected(answerContent, i);
            const correct = isCorrect(correctAnswer, i);
            const classNames = [
              styles.optionItem,
              selected && correct ? styles.optionSelectedCorrect : "",
              selected && !correct ? styles.optionSelectedWrong : "",
              !selected && correct ? styles.optionCorrect : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={i} className={classNames}>
                <span>
                  {String.fromCharCode(65 + i)}. {opt}
                </span>
                {correct && <Checkmark size={16} className={styles.correctIcon} />}
              </div>
            );
          })}
        </div>
        {correctAnswer != null && (
          <div className={`${styles.correctAnswerLine} ${styles.referenceInline}`}>
            <span className={styles.correctAnswerLabel}>
              {t("grading.correctAnswer", "正確答案")}:
            </span>
            <span className={styles.correctAnswerText}>
              {formatCorrectLabel(correctAnswer, options)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnswerDisplay;
