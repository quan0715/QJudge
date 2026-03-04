import { useState, useEffect } from "react";
import { Button, NumberInput, TextArea, Tag } from "@carbon/react";
import { ArrowRight, UserFollow, Checkmark } from "@carbon/icons-react";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import type { GradingAnswerRow } from "./gradingTypes";
import { isSubjectiveType } from "./gradingTypes";
import { useTranslation } from "react-i18next";
import styles from "./GradingPanel.module.scss";

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
function formatCorrectLabel(
  correctAnswer: unknown,
  options: string[],
): string {
  if (correctAnswer == null) return "";
  if (Array.isArray(correctAnswer)) {
    return correctAnswer
      .map((i) => `${String.fromCharCode(65 + Number(i))}. ${options[Number(i)] ?? ""}`)
      .join("、");
  }
  const i = Number(correctAnswer);
  return `${String.fromCharCode(65 + i)}. ${options[i] ?? ""}`;
}

/** Get text content from answer for subjective questions. */
function getTextAnswer(row: GradingAnswerRow): string {
  const text = (row.answerContent as Record<string, unknown>).text;
  return typeof text === "string" ? text : JSON.stringify(row.answerContent, null, 2);
}

interface GradingSplitPanelScreenProps {
  answer: GradingAnswerRow | null;
  onGrade: (answerId: string, score: number, feedback: string) => void;
  onNext?: () => void;
  hasNext?: boolean;
  onNextStudent?: () => void;
  hasNextStudent?: boolean;
}

export default function GradingSplitPanelScreen({
  answer,
  onGrade,
  onNext,
  hasNext = false,
  onNextStudent,
  hasNextStudent = false,
}: GradingSplitPanelScreenProps) {
  const { t } = useTranslation("contest");
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (answer) {
      setScore(answer.score ?? 0);
      setFeedback(answer.feedback ?? "");
      setSaved(false);
    }
  }, [answer?.id]);

  if (!answer) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelEmpty}>
          {t("grading.selectAnswerToGrade", "選擇一位學生的作答來開始批改")}
        </div>
      </div>
    );
  }

  const handleSave = () => {
    onGrade(answer.id, score, feedback);
    setSaved(true);
    if (hasNext && onNext) {
      setTimeout(() => onNext(), 300);
    } else if (!hasNext && hasNextStudent && onNextStudent) {
      setTimeout(() => onNextStudent(), 300);
    }
  };

  const isObjective = !isSubjectiveType(answer.questionType);
  const hasOptions = answer.questionOptions.length > 0;

  return (
    <div className={styles.panel}>
      {/* Header bar */}
      <div className={styles.panelHeader}>
        <div className={styles.panelMeta}>
          <Tag type="high-contrast" size="sm">
            Q{answer.questionIndex}
          </Tag>
          <Tag type="blue" size="sm">
            {t(`questionTypes.${answer.questionType}`, answer.questionType)}
          </Tag>
          <Tag type="teal" size="sm">
            {t("grading.fullScore", "滿分")} {answer.maxScore}
          </Tag>
          {answer.gradedBy && (
            <Tag type="green" size="sm">
              {answer.gradedBy === "system"
                ? t("grading.auto", "自動批改")
                : `${answer.gradedBy}`}
            </Tag>
          )}
        </div>
      </div>

      <div className={styles.panelContent}>
        {/* Student */}
        <div className={styles.panelSection}>
          <span className={styles.panelLabel}>{t("grading.student", "學生")}</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            {answer.studentNickname} ({answer.studentUsername})
          </span>
        </div>

        {/* Prompt — Markdown rendered */}
        <div className={styles.panelSection}>
          <span className={styles.panelLabel}>{t("grading.question", "題目")}</span>
          <div className={styles.panelPrompt}>
            <MarkdownContent.Problem>{answer.questionPrompt}</MarkdownContent.Problem>
          </div>
        </div>

        {/* Answer section — merged options + answer for objective; text for subjective */}
        <div className={styles.panelSection}>
          <span className={styles.panelLabel}>{t("grading.answerContent", "作答內容")}</span>

          {isObjective && hasOptions ? (
            <>
              {/* Option list with selection + correct highlighting */}
              <div className={styles.optionsList}>
                {answer.questionOptions.map((opt, i) => {
                  const selected = isSelected(answer.answerContent as Record<string, unknown>, i);
                  const correct = isCorrect(answer.correctAnswer, i);
                  const classNames = [
                    styles.optionItem,
                    selected && correct ? styles.optionSelectedCorrect : "",
                    selected && !correct ? styles.optionSelectedWrong : "",
                    !selected && correct ? styles.optionCorrect : "",
                  ].filter(Boolean).join(" ");

                  return (
                    <div key={i} className={classNames}>
                      <span>
                        {String.fromCharCode(65 + i)}. {opt}
                      </span>
                      {correct && (
                        <Checkmark size={16} className={styles.correctIcon} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Correct answer summary */}
              {answer.correctAnswer != null && (
                <div className={styles.correctAnswerLine}>
                  <span className={styles.correctAnswerLabel}>{t("grading.correctAnswer", "正確答案")}：</span>
                  <span className={styles.correctAnswerText}>
                    {formatCorrectLabel(answer.correctAnswer, answer.questionOptions)}
                  </span>
                </div>
              )}
            </>
          ) : (
            /* Subjective — Markdown rendered text */
            <div className={styles.panelAnswer}>
              <MarkdownContent.Simple>{getTextAnswer(answer)}</MarkdownContent.Simple>
            </div>
          )}
        </div>

        {/* Reference answer for subjective questions */}
        {!isObjective && answer.correctAnswer != null && typeof answer.correctAnswer === "string" && (
          <div className={styles.panelSection}>
            <span className={styles.panelLabel}>{t("grading.referenceAnswer", "參考答案")}</span>
            <div className={styles.panelReference}>
              <MarkdownContent.Simple>{answer.correctAnswer}</MarkdownContent.Simple>
            </div>
          </div>
        )}

        {/* Score */}
        <div className={styles.panelSection}>
          <div className={styles.scoreRow}>
            <NumberInput
              id="panel-score"
              label={t("grading.score", "分數")}
              value={score}
              min={0}
              max={answer.maxScore}
              step={0.5}
              size="sm"
              onChange={(_: unknown, { value }: { value: string | number }) =>
                setScore(Number(value))
              }
              style={{ maxWidth: "140px" }}
            />
            <span className={styles.scoreMax}>/ {answer.maxScore}</span>
          </div>
        </div>

        {/* Feedback */}
        <div className={styles.panelSection}>
          <TextArea
            id="panel-feedback"
            labelText={t("grading.feedback", "評語（選填）")}
            value={feedback}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setFeedback(e.target.value)
            }
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className={styles.panelActions}>
          {hasNext && (
            <Button
              kind="secondary"
              size="sm"
              renderIcon={ArrowRight}
              onClick={onNext}
            >
              {t("grading.nextQuestion", "下一題")}
            </Button>
          )}
          {!hasNext && hasNextStudent && (
            <Button
              kind="secondary"
              size="sm"
              renderIcon={UserFollow}
              onClick={onNextStudent}
            >
              {t("grading.nextStudent", "下一位學生")}
            </Button>
          )}
          <Button
            kind="primary"
            size="sm"
            renderIcon={Checkmark}
            onClick={handleSave}
          >
            {saved ? t("grading.saved", "已儲存") : t("grading.save", "儲存")}
          </Button>
        </div>
      </div>
    </div>
  );
}
