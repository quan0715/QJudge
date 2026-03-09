import { useState, useEffect } from "react";
import { Button, NumberInput, TextArea, Tag } from "@carbon/react";
import { ArrowRight, UserFollow, Checkmark } from "@carbon/icons-react";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import type { GradingAnswerRow } from "./gradingTypes";
import { useTranslation } from "react-i18next";
import styles from "./GradingPanel.module.scss";

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

        {/* Answer + correct answer — shared component */}
        <AnswerDisplay
          questionType={answer.questionType}
          answerContent={answer.answerContent}
          options={answer.questionOptions}
          correctAnswer={answer.correctAnswer}
        />

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
