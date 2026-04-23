import { useState, useCallback } from "react";
import { Button, InlineLoading, TextArea } from "@carbon/react";
import { Help } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { QuestionRequest } from "@/core/types/chatbot.types";
import styles from "./QuestionCard.module.scss";

interface QuestionCardProps {
  request: QuestionRequest;
  onSubmit: (answer: string) => void;
  onDismiss?: () => void;
}

export function QuestionCard({ request, onSubmit, onDismiss }: QuestionCardProps) {
  const { t } = useTranslation("chatbot");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isChoice = request.inputType === "choice" && request.options?.length;

  const handleSubmit = useCallback(() => {
    if (!answer.trim()) return;
    setSubmitting(true);
    onSubmit(answer.trim());
  }, [answer, onSubmit]);

  const handleChoiceClick = useCallback(
    (option: string) => {
      setAnswer(option);
      setSubmitting(true);
      onSubmit(option);
    },
    [onSubmit],
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
                  disabled={submitting}
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
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={submitting}
                rows={2}
              />
            </div>
          )}
        </div>

        {submitting ? (
          <div className={styles.loadingFooter}>
            <InlineLoading description={t("ui.processing")} />
          </div>
        ) : (
          <div className={styles.footer}>
            <Button
              kind="primary"
              size="lg"
              className={styles.footerBtn}
              onClick={handleSubmit}
              disabled={!isChoice && !answer.trim()}
            >
              {t("ui.submitAnswer", "送出回答")}
            </Button>
            {onDismiss && (
              <Button
                kind="secondary"
                size="lg"
                className={styles.footerBtn}
                onClick={onDismiss}
              >
                {t("ui.skipQuestion", "略過")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
