import { type FC, memo, useRef, useLayoutEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  RadioButton,
  RadioButtonGroup,
  Checkbox,
  Tag,
  IconButton,
} from "@carbon/react";
import { Flag, FlagFilled, DocumentBlank, Home } from "@carbon/icons-react";
import type {
  ExamQuestion,
  ExamQuestionAnswerFormat,
  ExamQuestionGroup,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import {
  OpenAnswerDocumentEditor,
  normalizeOpenAnswerDocument,
} from "@/shared/ui/editor";
import { formatScore, formatScoreCompact, roundScore } from "@/features/contest/utils/scoreFormat";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import ExamQuestionPrompt from "./ExamQuestionPrompt";
import ExamQuestionGroupStem from "./ExamQuestionGroupStem";
import { PanelHeader } from "@/shared/layout/PanelHeader";
import { SolverLayout } from "@/shared/layout/SolverLayout";
import styles from "./ExamQuestionCard.module.scss";

const TYPE_COLORS: Record<ExamQuestionType, string> = {
  true_false: "teal",
  single_choice: "blue",
  multiple_choice: "purple",
  short_answer: "cyan",
  essay: "magenta",
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
  /** "workspace" splits statement and answer into the exam shell's panels. */
  layout?: "card" | "workspace";
  /** Workspace only: footer under the statement, e.g. previous / next. */
  footer?: ReactNode;
  onBackToDashboard?: () => void;
  question: ExamQuestion;
  group?: ExamQuestionGroup;
  showGroupStem?: boolean;
  index: number;
  displayLabel?: string;
  groupLabel?: string;
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
  layout = "card",
  footer,
  onBackToDashboard,
  group,
  showGroupStem = false,
  index,
  displayLabel,
  groupLabel,
  answer,
  onAnswerChange,
  onBlur,
  readOnly = false,
  isMarked = false,
  onToggleMark,
}) => {
  const { t } = useTranslation(["contest", "common"]);
  const isObjective = question.questionType === "single_choice"
    || question.questionType === "multiple_choice"
    || question.questionType === "true_false";
  const answerScrollRef = useRef<HTMLDivElement>(null);
  const answerScrollPositions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    if (answerScrollRef.current) {
      answerScrollRef.current.scrollTop = answerScrollPositions.current.get(question.id) ?? 0;
    }
  }, [question.id]);

  const handleChange = (value: unknown) => {
    onAnswerChange?.(question.id, value, question.questionType, question.answerFormat);
  };

  const handleBlur = () => {
    onBlur?.(question.id);
  };

  const renderSubjectiveInput = () => (
    <OpenAnswerDocumentEditor
      variant={layout === "workspace" ? "paper" : "default"}
      data-testid={`exam-answer-input-${question.id}`}
      value={normalizeOpenAnswerDocument(answer)}
      onChange={handleChange}
      onBlur={handleBlur}
      readOnly={readOnly}
      ariaLabel={t("answering.openAnswer.ariaLabel", "開放題作答紙")}
      placeholder="直接開始寫，或輸入 / 插入文字與公式"
    />
  );

  const handleChoiceSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("label, input")) return;
    const option = target.closest(`.${styles.choiceOption}`);
    const input = option?.querySelector<HTMLInputElement>("input");
    if (input && !input.disabled) input.click();
  };

  const renderAnswerInput = () => {
    switch (question.questionType) {
      case "true_false":
        return (
          <div className={styles.choiceGroup} onClick={handleChoiceSurfaceClick} onBlur={handleBlur}>
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
                className={styles.choiceOption}
                labelText={t("answering.question.trueOption")}
                value="0"
                id={`${question.id}-true`}
                data-testid={`exam-answer-option-${question.id}-true`}
              />
              <RadioButton
                className={styles.choiceOption}
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
          <div className={styles.choiceGroup} onClick={handleChoiceSurfaceClick} onBlur={handleBlur}>
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
                className={styles.choiceOption}
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
          <div className={styles.optionList} onClick={handleChoiceSurfaceClick} onBlur={handleBlur}>
            {question.options.map((opt, i) => (
              <Checkbox
                className={styles.choiceOption}
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
      case "essay":
        return renderSubjectiveInput();

      default:
        return null;
    }
  };

  const markButton = !readOnly && onToggleMark ? (
    <button
      className={`${styles.markBtn} ${isMarked ? styles.markBtnActive : ""}`}
      onClick={() => onToggleMark(question.id)}
      aria-label={t("answering.mark.toggle")}
      type="button"
    >
      {isMarked ? <FlagFilled size={16} /> : <Flag size={16} />}
      <span>{t("answering.mark.toggle")}</span>
    </button>
  ) : null;

  if (layout === "workspace") {
    const statement = (
      <>
        {group && showGroupStem && <ExamQuestionGroupStem group={group} label={groupLabel} compactScore />}
        <div className={styles.header}>
          <span className={styles.label}>
            {t("answering.submit.questionPreview", { index: displayLabel ?? index + 1 })}
            <span className={styles.typeChip}>{t(`answering.questionTypes.${question.questionType}`)}</span>
          </span>
          <div className={styles.headerRight}>
            {onBackToDashboard && <IconButton kind="ghost" size="sm" label={t("contestShell.backToContestHome", "返回競賽主頁")} onClick={onBackToDashboard}><Home size={16} /></IconButton>}
            {!readOnly && onToggleMark && (
              <IconButton
                kind="ghost"
                size="sm"
                className={isMarked ? styles.markBtnActive : undefined}
                onClick={() => onToggleMark(question.id)}
                label={t("answering.mark.toggle")}
                aria-pressed={isMarked}
                type="button"
              >
                {isMarked ? <FlagFilled size={16} /> : <Flag size={16} />}
              </IconButton>
            )}
            <span className={styles.score}>{formatScoreCompact(question.score)} {t("scoreboard.status.pts")}</span>
          </div>
        </div>
        <ExamQuestionPrompt content={question.prompt} emptyText={t("answering.question.promptEmpty")} />
      </>
    );
    return (
      <div className={styles.workspace} data-testid={`exam-question-card-${question.id}`}>
        <SolverLayout
          allowStatementCollapse={false}
          statementFooter={footer}
          statementKey={question.id}
          statementTitle={t("answering.workspace.statement", "題目內容")}
          statementTabs={[{ id: "question", label: t("answering.workspace.statement", "題目內容"), icon: DocumentBlank }]}
          renderStatementContent={() => <section className={styles.statement} aria-label={t("answering.workspace.statement", "題目內容")}>{statement}</section>}
          editorPanel={
            <section className={styles.answerPanel} aria-label={t("answering.question.answerLabel")}>
              <PanelHeader title={t("answering.question.answerLabel")} />
              <div
                ref={answerScrollRef}
                onScroll={(event) => answerScrollPositions.current.set(question.id, event.currentTarget.scrollTop)}
                className={`${styles.answerContent} ${isObjective ? "" : styles.paperAnswer}`}
              >
                {isObjective && (
                  <p className={styles.responseHint}>
                    {question.questionType === "multiple_choice"
                      ? t("answering.question.selectAll", "選擇所有符合的答案")
                      : t("answering.question.selectOne", "選擇一個答案")}
                  </p>
                )}
                <div key={question.id}>{renderAnswerInput()}</div>
              </div>
            </section>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.card} data-testid={`exam-question-card-${question.id}`}>
      {group && showGroupStem && <ExamQuestionGroupStem group={group} label={groupLabel} />}

      {isObjective ? (
        <div className={styles.objectiveQuestion}>
          <span className={styles.objectiveNumber}>{displayLabel ?? index + 1}.</span>
          <div className={styles.objectiveContent}>
            {question.prompt.trim() ? (
              <MarkdownRenderer enableMath enableHighlight className={styles.objectivePrompt}>
                {question.prompt}
              </MarkdownRenderer>
            ) : null}
            {" "}<span className={styles.objectiveMeta}>
              （{t(`answering.questionTypes.${question.questionType}`)}，{roundScore(question.score)} {t("scoreboard.status.pts")}）
            </span>
            {markButton}
          </div>
        </div>
      ) : (<>
      <div className={styles.header}>
        <span className={styles.label}>
          {displayLabel ?? index + 1}.
          <Tag size="sm" type={TYPE_COLORS[question.questionType] as never}>
            {t(`answering.questionTypes.${question.questionType}`)}
          </Tag>
        </span>
        <div className={styles.headerRight}>
          {markButton}
          <span className={styles.score}>{formatScore(question.score)} {t("scoreboard.status.pts")}</span>
        </div>
      </div>

      {question.prompt.trim() && <ExamQuestionPrompt
        content={question.prompt}
        emptyText={t("answering.question.promptEmpty")}
      />}
      </>)}

      <div className={styles.answerArea}>
        {!isObjective && <div className={styles.answerLabel}>{t("answering.question.answerLabel")}</div>}
        {renderAnswerInput()}
      </div>
    </div>
  );
});

ExamQuestionCard.displayName = "ExamQuestionCard";

export default ExamQuestionCard;
