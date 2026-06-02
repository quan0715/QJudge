import { type FC, memo, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  RadioButton,
  RadioButtonGroup,
  Checkbox,
  TextArea,
  Tag,
} from "@carbon/react";
import { Flag, FlagFilled } from "@carbon/icons-react";
import type {
  ExamQuestion,
  ExamQuestionAnswerFormat,
  ExamQuestionGroup,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import {
  MathMarkdownEditor,
  OpenAnswerDocumentEditor,
  createEmptyOpenAnswerDocument,
  isOpenAnswerDocument,
} from "@/shared/ui/editor";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import ExamQuestionPrompt from "./ExamQuestionPrompt";
import styles from "./ExamQuestionCard.module.scss";

const TYPE_COLORS: Record<ExamQuestionType, string> = {
  true_false: "teal",
  single_choice: "blue",
  multiple_choice: "purple",
  short_answer: "cyan",
  essay: "magenta",
};

const AutoResizeTextArea: FC<React.ComponentProps<typeof TextArea> & { minHeight?: number }> = ({ minHeight = 120, ...props }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [minHeight]);

  useEffect(() => {
    resize();
  }, [props.value, resize]);

  return (
    <div className={styles.textArea}>
      <TextArea
        {...props}
        ref={(node: HTMLTextAreaElement | null) => {
          (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
          if (node) {
            node.style.height = "auto";
            node.style.height = `${Math.max(node.scrollHeight, minHeight)}px`;
          }
        }}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
          props.onChange?.(e);
          resize();
        }}
      />
    </div>
  );
};

const OptionMarkdownLabel: FC<{ letter: string; children: string }> = ({
  letter,
  children,
}) => (
  <span className={styles.optionMarkdownLabel}>
    <span className={styles.optionLetter}>{letter}.</span>
    <MarkdownRenderer enableMath enableHighlight className={styles.optionMarkdownContent}>
      {children}
    </MarkdownRenderer>
  </span>
);

interface ExamQuestionCardProps {
  question: ExamQuestion;
  group?: ExamQuestionGroup;
  showGroupStem?: boolean;
  index: number;
  answer?: unknown;
  onAnswerChange?: (
    questionId: string,
    value: unknown,
    questionType?: ExamQuestionType,
    answerFormat?: ExamQuestionAnswerFormat,
  ) => void;
  onBlur?: (questionId: string) => void;
  readOnly?: boolean;
  isMarked?: boolean;
  onToggleMark?: (id: string) => void;
}

export const ExamQuestionCard: FC<ExamQuestionCardProps> = memo(({
  question,
  group,
  showGroupStem = false,
  index,
  answer,
  onAnswerChange,
  onBlur,
  readOnly = false,
  isMarked = false,
  onToggleMark,
}) => {
  const { t } = useTranslation(["contest", "common"]);

  const handleChange = (value: unknown) => {
    onAnswerChange?.(question.id, value, question.questionType, question.answerFormat);
  };

  const handleBlur = () => {
    onBlur?.(question.id);
  };

  const renderSubjectiveInput = (minRows: number, placeholder: string) => {
    const value = typeof answer === "string" ? answer : "";

    if (question.answerFormat === "open_document") {
      return (
        <OpenAnswerDocumentEditor
          data-testid={`exam-answer-input-${question.id}`}
          value={isOpenAnswerDocument(answer) ? answer : createEmptyOpenAnswerDocument()}
          onChange={handleChange}
          onBlur={handleBlur}
          readOnly={readOnly}
          ariaLabel={t("answering.openAnswer.ariaLabel", "開放題作答紙")}
          placeholder={t(
            "answering.openAnswer.placeholder",
            "輸入解題過程，可用工具列或 / 插入公式",
          )}
        />
      );
    }

    if (
      question.answerFormat === "markdown" ||
      question.answerFormat === "markdown_math"
    ) {
      const enableMath = question.answerFormat === "markdown_math";
      return (
        <MathMarkdownEditor
          id={`q-${question.id}`}
          data-testid={`exam-answer-input-${question.id}`}
          enableMath={enableMath}
          showMathToolbar={enableMath}
          ariaLabel={
            enableMath
              ? t("answering.mathEditor.ariaLabel", "數學解答編輯器")
              : t("answering.markdownEditor.ariaLabel", "Markdown 解答編輯器")
          }
          placeholder={
            enableMath
              ? t(
                  "answering.mathEditor.placeholder",
                  "輸入計算過程，可用上方按鈕插入常用公式",
                )
              : t(
                  "answering.markdownEditor.placeholder",
                  "輸入解答，可使用 Markdown 排版",
                )
          }
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          readOnly={readOnly}
          minRows={minRows}
        />
      );
    }

    return (
      <AutoResizeTextArea
        id={`q-${question.id}`}
        data-testid={`exam-answer-input-${question.id}`}
        labelText=""
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          handleChange(e.target.value)
        }
        onBlur={handleBlur}
        disabled={readOnly}
        minHeight={minRows <= 4 ? 48 : 120}
      />
    );
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
                  labelText={
                    <OptionMarkdownLabel letter={String.fromCharCode(65 + i)}>
                      {opt}
                    </OptionMarkdownLabel>
                  }
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
                labelText={
                  <OptionMarkdownLabel letter={String.fromCharCode(65 + i)}>
                    {opt}
                  </OptionMarkdownLabel>
                }
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
        return renderSubjectiveInput(
          4,
          t("answering.question.shortAnswerPlaceholder"),
        );

      case "essay":
        return renderSubjectiveInput(
          8,
          t("answering.question.essayPlaceholder"),
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.card} data-testid={`exam-question-card-${question.id}`}>
      {group && showGroupStem && (
        <section className={styles.groupStem} aria-label={t("answering.group.sharedStem")}>
          <div className={styles.groupStemHeader}>
            <span className={styles.groupStemTitle}>
              {group.title || t("answering.group.sharedStem")}
            </span>
            <span className={styles.groupStemScore}>
              {t("answering.group.totalScore", {
                score: group.totalScore,
                defaultValue: "小計 {{score}} 分",
              })}
            </span>
          </div>
          <MarkdownRenderer enableMath enableHighlight>
            {group.sharedStemMarkdown}
          </MarkdownRenderer>
        </section>
      )}

      <div className={styles.header}>
        <span className={styles.label}>
          {t("answering.submit.questionPreview", { index: index + 1 })}
          <Tag size="sm" type={TYPE_COLORS[question.questionType] as never}>
            {t(`answering.questionTypes.${question.questionType}`)}
          </Tag>
        </span>
        <div className={styles.headerRight}>
          {!readOnly && onToggleMark && (
            <button
              className={`${styles.markBtn} ${isMarked ? styles.markBtnActive : ""}`}
              onClick={() => onToggleMark(question.id)}
              aria-label={t("answering.mark.toggle")}
              type="button"
            >
              {isMarked ? <FlagFilled size={16} /> : <Flag size={16} />}
              <span>{t("answering.mark.toggle")}</span>
            </button>
          )}
          <span className={styles.score}>{question.score} {t("scoreboard.status.pts")}</span>
        </div>
      </div>

      <ExamQuestionPrompt
        content={question.prompt}
        emptyText={t("answering.question.promptEmpty")}
      />

      <div className={styles.answerArea}>
        <div className={styles.answerLabel}>{t("answering.question.answerLabel")}</div>
        {renderAnswerInput()}
      </div>
    </div>
  );
});

ExamQuestionCard.displayName = "ExamQuestionCard";

export default ExamQuestionCard;
