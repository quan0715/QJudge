import React from "react";
import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import styles from "./AIExamQuestionCard.module.scss";

export interface AIExamQuestionCardProps {
  questionType: ExamQuestionType;
  prompt: string;
  score?: number;
  optionCount?: number;
}

export const AIExamQuestionCard: React.FC<AIExamQuestionCardProps> = ({
  questionType,
  prompt,
  score,
  optionCount,
}) => {
  const { t } = useTranslation("common");
  const Icon = EXAM_QUESTION_TYPE_ICON[questionType];
  const typeLabel = getQuestionTypeLabel(questionType);

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.typeInfo}>
          <span className={styles.icon}>
            <Icon size={16} />
          </span>
          <span className={styles.typeLabel}>{typeLabel}</span>
        </div>
        {score != null && (
          <Tag size="sm" type="gray">
            {t("aiCard.score", "{{score}} 分", { score })}
          </Tag>
        )}
      </div>

      <p className={styles.prompt} title={prompt}>
        {prompt}
      </p>

      {optionCount != null && optionCount > 0 && (
        <span className={styles.meta}>
          {t("aiCard.optionCount", "{{count}} 個選項", { count: optionCount })}
        </span>
      )}
    </div>
  );
};
