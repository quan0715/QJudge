import { Button } from "@carbon/react";
import { ChevronLeft, ChevronRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { QuestionProgress } from "./gradingTypes";
import styles from "./GradingByQuestion.module.scss";

interface QuestionSidebarScreenProps {
  questions: QuestionProgress[];
  selectedQuestionId: string | null;
  onSelect: (questionId: string) => void;
  onHoverQuestion?: (questionId: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function QuestionSidebarScreen({
  questions,
  selectedQuestionId,
  onSelect,
  onHoverQuestion,
  collapsed = false,
  onToggleCollapse,
}: QuestionSidebarScreenProps) {
  const { t } = useTranslation("contest");

  if (collapsed) {
    return (
      <div className={styles.collapsedPane}>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={ChevronRight}
          iconDescription={t("grading.expandQuestionList", "展開題目列表")}
          onClick={onToggleCollapse}
        />
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeaderRow}>
        <div className={styles.sidebarHeader}>{t("grading.questionList")}</div>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={ChevronLeft}
          iconDescription={t("grading.collapseQuestionList", "收摺題目列表")}
          onClick={onToggleCollapse}
        />
      </div>
      {questions.map((q) => {
        const isActive = q.questionId === selectedQuestionId;
        const statusClass =
          q.totalAnswers === 0
            ? styles.statusEmpty
            : q.progressPercent === 100 || q.isObjective
              ? styles.statusDone
              : styles.statusPending;
        return (
          <div
            key={q.questionId}
            className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ""}`}
            onClick={() => onSelect(q.questionId)}
            onMouseEnter={() => onHoverQuestion?.(q.questionId)}
            onMouseLeave={() => onHoverQuestion?.(null)}
            onFocus={() => onHoverQuestion?.(q.questionId)}
            onBlur={() => onHoverQuestion?.(null)}
            onPointerEnter={() => onHoverQuestion?.(q.questionId)}
            onPointerLeave={() => onHoverQuestion?.(null)}
            role="button"
            tabIndex={0}
          >
            <div>
              <div className={styles.sidebarLabelRow}>
                <span className={`${styles.statusDot} ${statusClass}`} />
                <div className={styles.sidebarLabel}>Q{q.questionIndex}</div>
              </div>
              <div className={styles.sidebarMeta}>
                {t(`common:questionType.label.${q.questionType}`, q.questionType)}
              </div>
            </div>
            <span
              className={`${styles.sidebarProgress} ${
                q.progressPercent === 100 ? styles.sidebarProgressDone : ""
              }`}
            >
              {q.isObjective ? "✓" : `${q.progressPercent}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
