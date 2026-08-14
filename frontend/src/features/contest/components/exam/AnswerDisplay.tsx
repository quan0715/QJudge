import { Checkmark, DotMark } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type {
  ExamQuestionAnswerFormat,
  ExamQuestionType,
  OpenAnswerDocument,
} from "@/core/entities/contest.entity";
import { isSubjectiveType } from "@/features/contest/screens/settings/grading/gradingTypes";
import {
  isOpenAnswerDocument,
  OpenAnswerDocumentRenderer,
} from "@/shared/ui/editor";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import ExamQuestionPreviewSection from "./ExamQuestionPreviewSection";

import styles from "./AnswerDisplay.module.scss";

export interface AnswerDisplayProps {
  questionType: ExamQuestionType;
  answerContent: Record<string, unknown>;
  options: string[];
  correctAnswer: unknown;
  explanation?: string | null;
  referenceAnswerDocument?: OpenAnswerDocument | null;
  explanationDocument?: OpenAnswerDocument | null;
  answerFormat?: ExamQuestionAnswerFormat;
  showCorrectness?: boolean;
}

function isSelected(
  answerContent: Record<string, unknown>,
  idx: number,
): boolean {
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

function getCorrectIndexes(correctAnswer: unknown): number[] {
  const resolved = resolveCorrectIndex(correctAnswer);
  if (resolved == null) return [];
  return Array.isArray(resolved) ? resolved : [resolved];
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
  referenceAnswerDocument,
  explanationDocument,
  answerFormat = "plain_text",
  showCorrectness = true,
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
    const openDocumentAnswer = isOpenAnswerDocument(answerContent.document)
      ? answerContent.document
      : null;
    const Content =
      answerFormat === "plain_text"
        ? MarkdownContent.Simple
        : MarkdownContent.Rich;
    return (
      <div className={styles.root}>
        <ExamQuestionPreviewSection
          label={t("grading.answerContent", "作答內容")}
        >
          {openDocumentAnswer ? (
            <OpenAnswerDocumentRenderer document={openDocumentAnswer} />
          ) : text ? (
            <Content>{text}</Content>
          ) : (
            <span className={styles.noAnswer}>
              {t("dashboard.noAnswer", "未作答")}
            </span>
          )}
        </ExamQuestionPreviewSection>
        {referenceAnswerDocument ? (
          <ExamQuestionPreviewSection
            label={t("grading.referenceAnswer", "參考答案")}
          >
            <OpenAnswerDocumentRenderer document={referenceAnswerDocument} />
          </ExamQuestionPreviewSection>
        ) : null}
        {!referenceAnswerDocument &&
          correctAnswer != null &&
          typeof correctAnswer === "string" && (
            <ExamQuestionPreviewSection
              label={t("grading.referenceAnswer", "參考答案")}
            >
              <div className={styles.referenceText}>
                <MarkdownContent.Problem>
                  {correctAnswer}
                </MarkdownContent.Problem>
              </div>
            </ExamQuestionPreviewSection>
          )}
        {explanationDocument ? (
          <ExamQuestionPreviewSection label={t("grading.explanation", "詳解")}>
            <OpenAnswerDocumentRenderer document={explanationDocument} />
          </ExamQuestionPreviewSection>
        ) : null}
        {!explanationDocument && explanation?.trim() ? (
          <ExamQuestionPreviewSection label={t("grading.explanation", "詳解")}>
            <div className={styles.referenceText}>
              <MarkdownContent.Problem>{explanation}</MarkdownContent.Problem>
            </div>
          </ExamQuestionPreviewSection>
        ) : null}
      </div>
    );
  }

  if (!hasOptions) {
    return (
      <div className={styles.root}>
        <span className={styles.noAnswer}>
          {t("dashboard.noAnswer", "未作答")}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <ExamQuestionPreviewSection
        label={t("grading.answerContent", "作答內容")}
      >
        <div className={styles.optionsList}>
          {effectiveOptions.map((opt, i) => {
            const selected = isSelected(answerContent, i);
            const correct = showCorrectness && isCorrect(correctAnswer, i);
            const classNames = [
              styles.optionItem,
              selected && !showCorrectness ? styles.optionSelected : "",
              selected && showCorrectness && correct
                ? styles.optionSelectedCorrect
                : "",
              selected && showCorrectness && !correct
                ? styles.optionSelectedWrong
                : "",
              !selected && showCorrectness && correct
                ? styles.optionCorrect
                : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={i} className={classNames}>
                <span className={styles.optionLabel}>
                  <span className={styles.optionText}>
                    <span className={styles.optionLetter}>
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <MarkdownContent.Problem className={styles.optionMarkdown}>
                      {opt}
                    </MarkdownContent.Problem>
                  </span>
                  {selected ? (
                    <DotMark
                      size={16}
                      className={styles.selectedIcon}
                      aria-label="Your answer"
                    />
                  ) : null}
                </span>
                {correct && (
                  <Checkmark size={16} className={styles.correctIcon} />
                )}
              </div>
            );
          })}
        </div>
      </ExamQuestionPreviewSection>
      {showCorrectness && correctAnswer != null && (
        <ExamQuestionPreviewSection label={t("grading.correctAnswer", "正確答案")}>
          <span className={styles.correctValues}>
            {getCorrectIndexes(correctAnswer).map((index) => (
              <span key={index} className={styles.correctValue}>
                <span className={styles.optionLetter}>
                  {String.fromCharCode(65 + index)}.
                </span>
                <MarkdownContent.Problem className={styles.optionMarkdown}>
                  {effectiveOptions[index] ?? ""}
                </MarkdownContent.Problem>
              </span>
            ))}
          </span>
        </ExamQuestionPreviewSection>
      )}
      {explanation?.trim() ? (
        <ExamQuestionPreviewSection label={t("grading.explanation", "詳解")}>
          <div className={styles.referenceText}>
            <MarkdownContent.Problem>{explanation}</MarkdownContent.Problem>
          </div>
        </ExamQuestionPreviewSection>
      ) : null}
    </div>
  );
};

export default AnswerDisplay;
