import { Button } from "@carbon/react";
import {
  Checkmark,
  ChevronLeft,
  ChevronRight,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import { formatScore } from "@/features/contest/utils/scoreFormat";
import {
  ListPanel,
  ListHeader,
  ListFooter,
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemTrailing,
} from "@/shared/ui/list/ListPanel";
import type { QuestionProgress } from "./gradingTypes";
import { computeEffectiveMaxTotal } from "./scorePolicyUtils";
import { ScorePolicyTag } from "./components/ScorePolicyMenu";
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

function getStatusClass(q: QuestionProgress) {
  if (q.totalAnswers === 0) return mini.statusEmpty;
  if (q.progressPercent === 100 || q.isObjective) return mini.statusDone;
  return mini.statusPending;
}

export default function QuestionSidebarScreen({
  questions,
  selectedQuestionId,
  onSelect,
  collapsed = false,
  onToggleCollapse,
}: QuestionSidebarScreenProps) {
  const { t } = useTranslation("contest");
  const orderedQuestions = [...questions].sort(
    (left, right) => left.questionIndex - right.questionIndex,
  );
  const totalQuestions = questions.length;
  const totalScore = computeEffectiveMaxTotal(
    questions.map((q) => ({
      maxScore: q.maxScore,
      effectiveMaxScore: q.effectiveMaxScore,
      scorePolicy: q.scorePolicy,
    })),
  );

  if (collapsed) {
    return (
      <div className={styles.sidebar}>
        <ListPanel
          header={
            <ListHeader
              title=""
              action={
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={ChevronRight}
                  iconDescription={t("grading.expandQuestionList", "展開題目列表")}
                  onClick={onToggleCollapse}
                />
              }
            />
          }
          footer={<ListFooter>&nbsp;</ListFooter>}
        >
          {orderedQuestions.map((q) => {
            const isActive = q.questionId === selectedQuestionId;
            const statusClass = getStatusClass(q);
            return (
              <ListItem
                key={q.questionId}
                size="compact"
                active={isActive}
                onClick={() => onSelect(q.questionId)}
                className={`${isActive ? mini.statusActive : ""} ${statusClass}`}
              >
                Q{q.questionIndex}
              </ListItem>
            );
          })}
        </ListPanel>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <ListPanel
        header={
          <ListHeader
            title={t("grading.questionList")}
            action={
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ChevronLeft}
                iconDescription={t("grading.collapseQuestionList", "收摺題目列表")}
                onClick={onToggleCollapse}
              />
            }
          />
        }
        footer={
          <ListFooter>
            <span>{t("grading.questionsCount", "{{count}} 題", { count: totalQuestions })}</span>
            <span>{t("grading.totalScore", "總分 {{score}}", { score: formatScore(totalScore) })}</span>
          </ListFooter>
        }
      >
        {orderedQuestions.map((q) => {
          const isActive = q.questionId === selectedQuestionId;
          const statusClass = getStatusClass(q);
          const TypeIcon = EXAM_QUESTION_TYPE_ICON[q.questionType];
          return (
            <ListItem
              key={q.questionId}
              active={isActive}
              onClick={() => onSelect(q.questionId)}
              className={`${isActive ? mini.statusActive : ""} ${statusClass}`}
            >
              <ListItemLeading className={styles.questionTypeMarker}>
                <TypeIcon
                  size={14}
                  className={styles.sidebarTypeIcon}
                  data-testid="question-type-marker"
                />
              </ListItemLeading>
              <ListItemContent>
                <ListItemTitle>
                  Q{q.questionIndex}
                  {q.scorePolicy && q.scorePolicy !== "normal" && (
                    <ScorePolicyTag policy={q.scorePolicy} />
                  )}
                  {q.scorePolicy !== "excluded" && q.scorePolicy !== "redistribute" && (
                    <span className={styles.sidebarScoreLabel}>
                      {q.effectiveMaxScore != null && q.effectiveMaxScore !== q.maxScore
                        ? `${formatScore(q.maxScore)}→${formatScore(q.effectiveMaxScore)}`
                        : formatScore(q.maxScore)}
                    </span>
                  )}
                </ListItemTitle>
              </ListItemContent>
              <ListItemTrailing>
                {q.totalAnswers > 0 && (q.progressPercent === 100 || q.isObjective) ? (
                  <span
                    className={styles.questionComplete}
                    aria-label={t(
                      "grading.completedCount",
                      "{{graded}}/{{total}} 完成",
                      { graded: q.gradedCount, total: q.totalAnswers },
                    )}
                    title={t(
                      "grading.completedCount",
                      "{{graded}}/{{total}} 完成",
                      { graded: q.gradedCount, total: q.totalAnswers },
                    )}
                  >
                    <Checkmark size={16} aria-hidden="true" />
                  </span>
                ) : q.totalAnswers > 0 ? (
                  <span
                    className={styles.questionProgressText}
                    aria-label={t(
                      "grading.gradedAnswerCount",
                      "已批改 {{graded}}，共 {{total}} 份",
                      { graded: q.gradedCount, total: q.totalAnswers },
                    )}
                  >
                    {q.gradedCount}/{q.totalAnswers}
                  </span>
                ) : (
                  <span
                    className={styles.questionProgressText}
                    aria-label={t("grading.noAnswers", "尚無作答")}
                  >
                    —
                  </span>
                )}
              </ListItemTrailing>
            </ListItem>
          );
        })}
      </ListPanel>
    </div>
  );
}
