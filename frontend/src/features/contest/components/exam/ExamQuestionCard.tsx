import type { FC } from "react";
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

const TYPE_LABELS: Record<ExamQuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "問答題",
};

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
  onAnswerChange?: (questionId: string, value: unknown) => void;
  readOnly?: boolean;
}

export const ExamQuestionCard: FC<ExamQuestionCardProps> = ({
  question,
  index,
  answer,
  onAnswerChange,
  readOnly = false,
}) => {
  const handleChange = (value: unknown) => {
    onAnswerChange?.(question.id, value);
  };

  const renderAnswerInput = () => {
    switch (question.questionType) {
      case "true_false":
        return (
          <RadioButtonGroup
            name={`q-${question.id}`}
            legendText=""
            orientation="vertical"
            valueSelected={answer as string | undefined}
            onChange={(val: string | number | undefined) => handleChange(String(val ?? ""))}
            disabled={readOnly}
          >
            <RadioButton labelText="是 (True)" value="true" id={`${question.id}-true`} />
            <RadioButton labelText="否 (False)" value="false" id={`${question.id}-false`} />
          </RadioButtonGroup>
        );

      case "single_choice":
        return (
          <RadioButtonGroup
            name={`q-${question.id}`}
            legendText=""
            orientation="vertical"
            valueSelected={answer as string | undefined}
            onChange={(val: string | number | undefined) => handleChange(String(val ?? ""))}
            disabled={readOnly}
          >
            {question.options.map((opt, i) => (
              <RadioButton
                key={i}
                labelText={`${String.fromCharCode(65 + i)}. ${opt}`}
                value={String(i)}
                id={`${question.id}-opt-${i}`}
              />
            ))}
          </RadioButtonGroup>
        );

      case "multiple_choice": {
        const selected = (answer as number[]) || [];
        return (
          <div className={styles.optionList}>
            {question.options.map((opt, i) => (
              <Checkbox
                key={i}
                id={`${question.id}-opt-${i}`}
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
              labelText=""
              placeholder="輸入你的答案..."
              value={(answer as string) || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange(e.target.value)
              }
              disabled={readOnly}
            />
          </div>
        );

      case "essay":
        return (
          <div className={styles.textArea}>
            <TextArea
              id={`q-${question.id}`}
              labelText=""
              placeholder="請詳細作答..."
              value={(answer as string) || ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                handleChange(e.target.value)
              }
              disabled={readOnly}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>
          第 {index + 1} 題
          <Tag size="sm" type={TYPE_COLORS[question.questionType] as never}>
            {TYPE_LABELS[question.questionType]}
          </Tag>
        </span>
        <span className={styles.score}>{question.score} 分</span>
      </div>

      {question.prompt ? (
        <div className={styles.prompt}>
          <MarkdownRenderer enableHighlight enableCopy>{question.prompt}</MarkdownRenderer>
        </div>
      ) : (
        <div className={styles.promptEmpty}>（尚未填寫題目敘述）</div>
      )}

      <div className={styles.answerArea}>
        <div className={styles.answerLabel}>作答區</div>
        {renderAnswerInput()}
      </div>
    </div>
  );
};

export default ExamQuestionCard;
