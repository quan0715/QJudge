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
  explanation?: string | null;
}

function isSelected(answerContent: Record<string, unknown>, idx: number): boolean {
  const selected = answerContent.selected;
  if (Array.isArray(selected)) return selected.includes(idx);
  return selected === idx;
}

function resolveCorrectIndex(correctAnswer: unknown): number | number[] | null {
  if (correctAnswer == null) return null;
  if (Array.isArray(correctAnswer)) return correctAnswer.map(Number);
  // true_false: boolean true → index 0 (True), false → index 1 (False)
  if (typeof correctAnswer === "boolean") return correctAnswer ? 0 : 1;
  return Number(correctAnswer);
}

function isCorrect(correctAnswer: unknown, idx: number): boolean {
  const resolved = resolveCorrectIndex(correctAnswer);
  if (resolved == null) return false;
  if (Array.isArray(resolved)) return resolved.includes(idx);
  return resolved === idx;
}

function formatCorrectLabel(correctAnswer: unknown, options: string[]): string {
  const resolved = resolveCorrectIndex(correctAnswer);
  if (resolved == null) return "";
  if (Array.isArray(resolved)) {
    return resolved
      .map((i) => `${String.fromCharCode(65 + i)}. ${options[i] ?? ""}`)
      .join(", ");
  }
  return `${String.fromCharCode(65 + resolved)}. ${options[resolved] ?? ""}`;
}

function getTextAnswer(answerContent: Record<string, unknown>): string {
  const text = answerContent.text;
  return typeof text === "string" ? text : "";
}

const TRUE_FALSE_DEFAULT_OPTIONS = ["True", "False"];

const AnswerDisplay: React.FC<AnswerDisplayProps> = ({
  questionType,
  answerContent,
  options,
  correctAnswer,
  explanation,
}) => {
  const { t } = useTranslation("contest");
  const subjective = isSubjectiveType(questionType);
  const effectiveOptions =
    questionType === "true_false" && options.length === 0
      ? TRUE_FALSE_DEFAULT_OPTIONS
      : options;
  const hasOptions = effectiveOptions.length > 0;

  if (subjective) {
    const text = getTextAnswer(answerContent);
    return (
      <div className={styles.root}>
        <div className={styles.group}>
          <span className={styles.label}>{t("grading.answerContent", "作答內容")}</span>
          {text ? (
            <MarkdownContent.Simple>{text}</MarkdownContent.Simple>
          ) : (
            <span className={styles.noAnswer}>{t("dashboard.noAnswer", "未作答")}</span>
          )}
        </div>
        {correctAnswer != null && typeof correctAnswer === "string" && (
          <div className={`${styles.group} ${styles.reference}`}>
            <span className={styles.label}>{t("grading.referenceAnswer", "參考答案")}</span>
            <div className={styles.referenceText}>
              <MarkdownContent.Simple>{correctAnswer}</MarkdownContent.Simple>
            </div>
          </div>
        )}
        {explanation?.trim() ? (
          <div className={`${styles.group} ${styles.reference}`}>
            <span className={styles.label}>{t("grading.explanation", "詳解")}</span>
            <div className={styles.referenceText}>
              <MarkdownContent.Simple>{explanation}</MarkdownContent.Simple>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (!hasOptions) {
    return (
      <div className={styles.root}>
        <span className={styles.noAnswer}>{t("dashboard.noAnswer", "未作答")}</span>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <span className={styles.label}>{t("grading.answerContent", "作答內容")}</span>
      <div className={styles.optionsList}>
        {effectiveOptions.map((opt, i) => {
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
        <div className={styles.correctSummary}>
          <span className={styles.correctLabel}>
            {t("grading.correctAnswer", "正確答案")}:
          </span>
          <span className={styles.correctValue}>
            {formatCorrectLabel(correctAnswer, effectiveOptions)}
          </span>
        </div>
      )}
      {explanation?.trim() ? (
        <div className={`${styles.group} ${styles.reference}`}>
          <span className={styles.label}>{t("grading.explanation", "詳解")}</span>
          <div className={styles.referenceText}>
            <MarkdownContent.Simple>{explanation}</MarkdownContent.Simple>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AnswerDisplay;
