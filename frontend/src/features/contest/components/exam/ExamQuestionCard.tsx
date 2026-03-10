import { type FC, memo } from "react";
import { useTranslation } from "react-i18next";
import {
  RadioButton,
  RadioButtonGroup,
  Checkbox,
  TextInput,
  TextArea,
  Tag,
} from "@carbon/react";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import styles from "./ExamQuestionCard.module.scss";

const TYPE_COLORS: Record<ExamQuestionType, string> = {
  true_false: "teal",
  single_choice: "blue",
  multiple_choice: "purple",
  short_answer: "cyan",
  essay: "magenta",
};

interface ExamQuestionCardProps {
  question: ExamQuestion;
  index: number;
  answer?: unknown;
  onAnswerChange?: (
    questionId: string,
    value: unknown,
    questionType?: ExamQuestionType,
  ) => void;
  onBlur?: (questionId: string) => void;
  readOnly?: boolean;
}

export const ExamQuestionCard: FC<ExamQuestionCardProps> = memo(({
  question,
  index,
  answer,
  onAnswerChange,
  onBlur,
  readOnly = false,
}) => {
  const { t } = useTranslation(["contest", "common"]);

  const handleChange = (value: unknown) => {
    onAnswerChange?.(question.id, value, question.questionType);
  };

  const handleBlur = () => {
    onBlur?.(question.id);
  };

  const renderAnswerInput = () => {
    switch (question.questionType) {
      case "true_false":
        return (
          <div onBlur={handleBlur}>
            <RadioButtonGroup
              name={`q-${question.id}`}
              legendText=""
              orientation="vertical"
              valueSelected={
                answer === undefined || answer === null ? undefined : String(answer)
              }
              onChange={(val: string | number | undefined) =>
                handleChange(Number(val))
              }
              disabled={readOnly}
            >
              <RadioButton
                labelText={t("answering.question.trueOption")}
                value="0"
                id={`${question.id}-true`}
                data-testid={`exam-answer-option-${question.id}-true`}
              />
              <RadioButton
                labelText={t("answering.question.falseOption")}
                value="1"
                id={`${question.id}-false`}
                data-testid={`exam-answer-option-${question.id}-false`}
              />
            </RadioButtonGroup>
          </div>
        );

      case "single_choice":
        return (
          <div onBlur={handleBlur}>
            <RadioButtonGroup
              name={`q-${question.id}`}
              legendText=""
              orientation="vertical"
              valueSelected={
                answer === undefined || answer === null ? undefined : String(answer)
              }
              onChange={(val: string | number | undefined) =>
                handleChange(Number(val))
              }
              disabled={readOnly}
            >
              {question.options.map((opt, i) => (
                <RadioButton
                  key={i}
                  labelText={`${String.fromCharCode(65 + i)}. ${opt}`}
                  value={String(i)}
                  id={`${question.id}-opt-${i}`}
                  data-testid={`exam-answer-option-${question.id}-${i}`}
                />
              ))}
            </RadioButtonGroup>
          </div>
        );

      case "multiple_choice": {
        const selected = (answer as number[]) || [];
        return (
          <div className={styles.optionList} onBlur={handleBlur}>
            {question.options.map((opt, i) => (
              <Checkbox
                key={i}
                id={`${question.id}-opt-${i}`}
                data-testid={`exam-answer-option-${question.id}-${i}`}
                labelText={`${String.fromCharCode(65 + i)}. ${opt}`}
                checked={selected.includes(i)}
                disabled={readOnly}
                onChange={(_: unknown, { checked }: { checked: boolean }) => {
                  const next = checked
                    ? [...selected, i]
                    : selected.filter((v) => v !== i);
                  handleChange(next.sort());
                }}
              />
            ))}
          </div>
        );
      }

      case "short_answer":
        return (
          <div className={styles.shortInput}>
            <TextInput
              id={`q-${question.id}`}
              data-testid={`exam-answer-input-${question.id}`}
              labelText=""
              placeholder={t("answering.question.shortAnswerPlaceholder")}
              value={(answer as string) || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange(e.target.value)
              }
              onBlur={handleBlur}
              disabled={readOnly}
            />
          </div>
        );

      case "essay":
        return (
          <div className={styles.textArea}>
            <TextArea
              id={`q-${question.id}`}
              data-testid={`exam-answer-input-${question.id}`}
              labelText=""
              placeholder={t("answering.question.essayPlaceholder")}
              value={(answer as string) || ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                handleChange(e.target.value)
              }
              onBlur={handleBlur}
              disabled={readOnly}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.card} data-testid={`exam-question-card-${question.id}`}>
      <div className={styles.header}>
        <span className={styles.label}>
          {t("answering.submit.questionPreview", { index: index + 1 })}
          <Tag size="sm" type={TYPE_COLORS[question.questionType] as never}>
            {t(`answering.questionTypes.${question.questionType}`)}
          </Tag>
        </span>
        <span className={styles.score}>{question.score} {t("scoreboard.status.pts")}</span>
      </div>

      {question.prompt ? (
        <div className={styles.prompt}>
          <MarkdownRenderer enableHighlight enableCopy>{question.prompt}</MarkdownRenderer>
        </div>
      ) : (
        <div className={styles.promptEmpty}>{t("answering.question.promptEmpty")}</div>
      )}

      <div className={styles.answerArea}>
        <div className={styles.answerLabel}>{t("answering.question.answerLabel")}</div>
        {renderAnswerInput()}
      </div>
    </div>
  );
});

ExamQuestionCard.displayName = "ExamQuestionCard";

export default ExamQuestionCard;
