import React from "react";
import { ClickableTile, Tag } from "@carbon/react";
import { CheckmarkFilled, Download, EventSchedule } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import { AcrBadge } from "@/shared/ui/tag";
import { getQuestionVisualFromBankQuestion, type QuestionVisualTone } from "@/shared/ui/questionVisual";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import {
  buildQuestionPreviewMeta,
  formatDownloadCount,
  getQuestionDisplayTitle,
  resolveExamQuestionType,
} from "@/features/question-banks/screens/questionBankProblemManagement.utils";
import styles from "./QuestionBankPreviewCard.module.scss";

const DIFFICULTY_LABEL_KEY = {
  easy: "difficulty.easy",
  medium: "difficulty.medium",
  hard: "difficulty.hard",
} as const;

const ICON_TONE_CLASS: Partial<Record<QuestionVisualTone, string>> = {
  coding: styles.iconToneCoding,
  single_choice: styles.iconToneSingleChoice,
  multiple_choice: styles.iconToneMultipleChoice,
  true_false: styles.iconToneTrueFalse,
  short_answer: styles.iconToneShortAnswer,
  essay: styles.iconToneEssay,
};

interface QuestionBankPreviewCardProps {
  question: BankQuestion;
  bank: QuestionBank;
  onClick?: () => void;
  selected?: boolean;
  showSelection?: boolean;
  iconVariant?: "colored" | "neutral";
  showBankMeta?: boolean;
  className?: string;
}

export const QuestionBankPreviewCard: React.FC<QuestionBankPreviewCardProps> = ({
  question,
  bank,
  onClick,
  selected = false,
  showSelection = false,
  iconVariant = "colored",
  showBankMeta = false,
  className,
}) => {
  const { t } = useTranslation("common");
  const meta = buildQuestionPreviewMeta(question, bank);
  const { Icon, tone } = getQuestionVisualFromBankQuestion(
    question,
    iconVariant === "neutral" ? "none" : "colored"
  );
  const displayTitle = getQuestionDisplayTitle(question);
  const visibleTags = meta.tags.slice(0, 2);
  const difficulty = (meta.difficulty || "medium").toLowerCase() as keyof typeof DIFFICULTY_LABEL_KEY;
  const difficultyKey = DIFFICULTY_LABEL_KEY[difficulty] || DIFFICULTY_LABEL_KEY.medium;
  const questionTypeLabel =
    question.questionType === "exam"
      ? getQuestionTypeLabel(resolveExamQuestionType(question))
      : t("questionType.label.coding", "程式題");

  const iconClass = iconVariant === "colored" && tone ? ICON_TONE_CLASS[tone] : undefined;

  return (
    <ClickableTile
      onClick={onClick}
      className={[
        styles.card,
        selected ? styles.cardSelected : "",
        showSelection ? styles.cardSelectable : "",
        className || "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.cardBody}>
        <div className={styles.topRow}>
          <div className={styles.typeInfo}>
            <span className={[styles.icon, iconClass || ""].filter(Boolean).join(" ")}>
              <Icon size={20} />
            </span>
            <span className={styles.typeLabel}>{questionTypeLabel}</span>
          </div>
          {meta.isVerified ? <CheckmarkFilled size={16} className={styles.verifiedIcon} /> : null}
        </div>

        <h4 className={styles.title} title={displayTitle}>
          {displayTitle}
        </h4>

        <div className={styles.bottomRow}>
          <div className={styles.badges}>
            {question.questionType !== "exam" && (
              <Tag size="sm" type="cool-gray">
                {t(difficultyKey, difficulty)}
              </Tag>
            )}
            {visibleTags.map((tag) => (
              <Tag key={tag} size="sm" type="gray">
                {tag}
              </Tag>
            ))}
          </div>

          <div className={styles.meta}>
            {meta.passRate != null && (
              <AcrBadge value={meta.passRate} size="sm" label={t("questionBank.passRate", "通過率")} />
            )}
            {question.contestUsages && question.contestUsages.length > 0 && (
              <span
                className={styles.contestUsage}
                title={question.contestUsages.map((u) => u.contestName).join(", ")}
              >
                <EventSchedule size={12} />
                {t("questionBank.usedInContests", "{{count}} 場考試", {
                  count: question.contestUsages.length,
                })}
              </span>
            )}
            {meta.downloadCount > 0 && (
              <span className={styles.download}>
                <Download size={12} />
                {formatDownloadCount(meta.downloadCount)}
              </span>
            )}
          </div>
        </div>

        {showBankMeta ? (
          <p className={styles.bankMeta} title={bank.name}>
            {t("questionBank.bankLabel", "題庫")}: {bank.name}
          </p>
        ) : null}
      </div>
    </ClickableTile>
  );
};

export default QuestionBankPreviewCard;
