import { Button } from "@carbon/react";
import {
  Boolean as BooleanIcon,
  Checkbox as CheckboxIcon,
  ChevronLeft,
  ChevronRight,
  Document,
  Pen,
  RadioButton as RadioButtonIcon,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { QuestionProgress } from "./gradingTypes";
import styles from "./GradingByQuestion.module.scss";
import mini from "./GradingMini.module.scss";

interface QuestionSidebarScreenProps {
  questions: QuestionProgress[];
  selectedQuestionId: string | null;
  onSelect: (questionId: string) => void;
  onHoverQuestion?: (questionId: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const QUESTION_TYPE_ICON = {
  single_choice: RadioButtonIcon,
  multiple_choice: CheckboxIcon,
  true_false: BooleanIcon,
  short_answer: Pen,
  essay: Document,
} as const;

function getStatusClass(q: QuestionProgress) {
  if (q.totalAnswers === 0) return mini.statusEmpty;
  if (q.progressPercent === 100 || q.isObjective) return mini.statusDone;
  return mini.statusPending;
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
  const orderedQuestions = [...questions].sort(
    (left, right) => left.questionIndex - right.questionIndex,
  );
  const totalQuestions = questions.length;
  const totalScore = questions.reduce((sum, question) => sum + (question.maxScore ?? 0), 0);

  if (collapsed) {
    return (
      <div className={`${styles.sidebar} ${styles.sidebarMini}`}>
        <div className={mini.miniHeader}>
          <button
            type="button"
            className={mini.miniToggleButton}
            onClick={onToggleCollapse}
            aria-label={t("grading.expandQuestionList", "展開題目列表")}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className={mini.miniList}>
          {orderedQuestions.map((q) => {
            const isActive = q.questionId === selectedQuestionId;
            const statusClass = getStatusClass(q);
            return (
              <button
                key={q.questionId}
                type="button"
                className={`${mini.miniItem} ${isActive ? mini.statusActive : ""} ${statusClass}`}
                onClick={() => onSelect(q.questionId)}
                aria-label={`Q${q.questionIndex}`}
              >
                Q{q.questionIndex}
              </button>
            );
          })}
        </div>
        <div className={mini.miniFooter} />
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
      <div className={styles.sidebarList}>
        {orderedQuestions.map((q) => {
          const isActive = q.questionId === selectedQuestionId;
          const statusClass = getStatusClass(q);
          const TypeIcon = QUESTION_TYPE_ICON[q.questionType];
          return (
            <div
              key={q.questionId}
              className={`${styles.sidebarItem} ${isActive ? mini.statusActive : ""} ${statusClass}`}
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
              <div className={styles.sidebarLeading}>
                <TypeIcon size={14} className={styles.sidebarTypeIcon} />
                <div className={styles.sidebarLabel}>Q{q.questionIndex}</div>
              </div>
              <span className={styles.sidebarProgress}>
                {q.gradedCount}/{q.totalAnswers}
              </span>
            </div>
          );
        })}
      </div>
      <div className={styles.sidebarFooter}>
        <span>{t("grading.questionsCount", "{{count}} 題", { count: totalQuestions })}</span>
        <span>{t("grading.totalScore", "總分 {{score}}", { score: totalScore })}</span>
      </div>
    </div>
  );
}
