import { useState, useCallback } from "react";
import { Button, InlineNotification, TextArea } from "@carbon/react";
import { Help } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { CopilotQuestionCardProps } from "@copilot";
import styles from "./QuestionCard.module.scss";

export function QuestionCard({
  request,
  interactionError,
  pending = false,
  onSubmit,
}: CopilotQuestionCardProps) {
  const { t } = useTranslation("chatbot");
  const [answer, setAnswer] = useState("");

  const isChoice = request.input === "choice" && request.options?.length;

  const handleSubmit = useCallback(() => {
    if (pending || !answer.trim()) return;
    onSubmit(answer.trim());
  }, [answer, onSubmit, pending]);

  const handleChoiceClick = useCallback(
    (option: string) => {
      if (pending) return;
      setAnswer(option);
      onSubmit(option);
    },
    [onSubmit, pending],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Help className={styles.headerIcon} />
          <span className={styles.headerLabel}>
            {t("ui.agentQuestion", "AI 助教提問")}
          </span>
        </div>

        <div className={styles.questionBody}>
          <p className={styles.questionText}>{request.question}</p>

          {isChoice ? (
            <div className={styles.optionsGrid}>
              {request.options!.map((option, idx) => (
                <Button
                  key={idx}
                  kind="tertiary"
                  size="md"
                  className={styles.optionBtn}
                  disabled={pending}
                  onClick={() => handleChoiceClick(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          ) : (
            <div className={styles.textInputWrapper}>
              <TextArea
                id="question-answer-input"
                labelText=""
                hideLabel
                placeholder={t(
                  "ui.questionPlaceholder",
                  "輸入你的回答…",
                )}
                value={answer}
                disabled={pending}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
              />
            </div>
          )}
        </div>

        {interactionError && (
          <InlineNotification
            hideCloseButton
            kind="error"
            lowContrast
            role="alert"
            title={interactionError.message ?? t("ui.interactionError", "無法送出回答，請再試一次")}
          />
        )}

        <div className={styles.footer}>
          <Button
            kind="primary"
            size="lg"
            className={styles.footerBtn}
            onClick={handleSubmit}
            disabled={pending || (!isChoice && !answer.trim())}
          >
            {t("ui.submitAnswer", "送出回答")}
          </Button>
        </div>
      </div>
    </div>
  );
}
