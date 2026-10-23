import { Button, ButtonSet, Tag, TextArea } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import { isSubjectiveType, type GradingAnswerRow } from "../gradingTypes";
import { correctOptionIndexes, selectedOptionIndexes } from "../objectiveRegrade";
import type { GradeDraft } from "./gradingWorkbenchModel";
import type { AnswerSource, WorkbenchStudentRow as Row } from "./workbenchRowModel";
import { WorkbenchScoreField, compactScore } from "./WorkbenchScoreField";
import styles from "./GradingWorkbench.module.scss";

interface WorkbenchStudentRowProps {
  row: Row;
  questions: ExamQuestion[];
  labels: Map<string, { label: string }>;
  maxScore: number;
  expanded: boolean;
  drafts: Record<string, GradeDraft>;
  /** Pending AI suggestions keyed by answer id. */
  suggestionScores: Record<string, { score: number; feedback: string }>;
  busy: boolean;
  onToggle(): void;
  onDraftChange(answerId: string, draft: GradeDraft): void;
  onPrimary(): void;
  onSecondary(): void;
}

const TAG_TYPE: Record<AnswerSource, "purple" | "gray" | "teal" | "outline"> = {
  ai: "purple",
  manual: "gray",
  auto: "teal",
  none: "outline",
  suggestion: "outline",
};

const optionLabel = (row: GradingAnswerRow, index: number) =>
  row.questionType === "true_false" ? (index === 0 ? "是" : "否") : String.fromCharCode(65 + index);

function optionTexts(row: GradingAnswerRow): string[] {
  return row.questionType === "true_false" ? ["是", "否"] : (row.questionOptions ?? []);
}

export function WorkbenchStudentRow({
  row,
  questions,
  labels,
  maxScore,
  expanded,
  drafts,
  suggestionScores,
  busy,
  onToggle,
  onDraftChange,
  onPrimary,
  onSecondary,
}: WorkbenchStudentRowProps) {
  const { t } = useTranslation("contest");
  const isGroup = questions.length > 1;
  const objective = !isSubjectiveType(questions[0]?.questionType ?? "short_answer");
  const pending = row.source === "suggestion";
  const valueOf = (answer: GradingAnswerRow): GradeDraft | null => {
    const draft = drafts[answer.id] ?? suggestionScores[answer.id];
    if (draft) return draft;
    return answer.score === null ? null : { score: answer.score, feedback: answer.feedback };
  };
  const suggestedTotal = row.answers.reduce(
    (sum, answer) => sum + (suggestionScores[answer.id]?.score ?? answer.score ?? 0),
    0,
  );
  const current = row.total === null ? "—" : compactScore(row.total);
  const scoreText = pending ? `${current} → ${compactScore(suggestedTotal)}` : current;
  const prefix = (answer: GradingAnswerRow) => (isGroup ? `${labels.get(answer.questionId)?.label ?? ""} ` : "");
  const picked = (answer: GradingAnswerRow) => {
    const texts = optionTexts(answer);
    const indexes = selectedOptionIndexes(answer);
    return indexes.length
      ? t("workbench.picked", "選 {{options}}", {
          options: indexes.map((index) => `${optionLabel(answer, index)}　${texts[index] ?? ""}`).join("、"),
        })
      : t("workbench.noAnswer", "未作答");
  };
  const summary = objective
    ? row.answers.map(picked).join("　")
    : row.source === "none" && !row.answers.some((answer) => answer.feedback)
      ? t("workbench.ungradedSummary", "尚未批改")
      : row.answers
          .map((answer) => `${prefix(answer)}${suggestionScores[answer.id]?.feedback ?? answer.feedback}`)
          .join("　");
  const sourceText: Record<AnswerSource, string> = {
    auto: t("workbench.source.auto", "自動"),
    suggestion: t("workbench.source.suggestion", "建議"),
    none: t("workbench.source.none", "未批改"),
    ai: t("workbench.source.ai", "AI"),
    manual: t("workbench.source.manual", "人工"),
  };

  return (
    <div className={styles.studentRow} data-expanded={expanded}>
      <button type="button" className={styles.rowButton} aria-expanded={expanded} onClick={onToggle}>
        <span className={styles.rowName}>{row.name}</span>
        <span className={pending ? styles.rowScorePending : styles.rowScore}>
          {scoreText}
          <span className={styles.scoreMax}> / {compactScore(maxScore)}</span>
        </span>
        <span className={styles.rowSummary}>{summary}</span>
        <Tag
          type={TAG_TYPE[row.source]}
          size="sm"
          className={row.source === "suggestion" ? styles.suggestionTag : undefined}
        >
          {sourceText[row.source]}
        </Tag>
      </button>
      {expanded && (
        <div className={styles.rowDetail}>
          <div className={styles.rowAnswer}>
            {row.answers.map((answer) =>
              objective ? (
                <ul key={answer.id} className={styles.optionList}>
                  {optionTexts(answer).map((text, index) => {
                    const isPicked = selectedOptionIndexes(answer).includes(index);
                    const isCorrect = correctOptionIndexes(answer).includes(index);
                    return (
                      <li
                        key={index}
                        className={isPicked ? (isCorrect ? styles.optionPicked : styles.optionWrong) : undefined}
                      >
                        <strong>{optionLabel(answer, index)}</strong>
                        <span>{text}</span>
                        <span className={styles.muted}>
                          {[
                            isPicked ? t("workbench.studentPick", "學生選擇") : "",
                            isCorrect ? t("workbench.correct", "正解") : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <section key={answer.id}>
                  {isGroup && <h4 className={styles.subLabel}>{labels.get(answer.questionId)?.label}</h4>}
                  <AnswerDisplay
                    questionType={answer.questionType}
                    answerFormat={answer.answerFormat}
                    answerContent={answer.answerContent}
                    options={answer.questionOptions}
                    correctAnswer={null}
                    showCorrectness={false}
                  />
                </section>
              ),
            )}
          </div>
          <div className={styles.rowForm}>
            {pending && (
              <p className={styles.currentScore}>
                {t("workbench.currentScore", "目前成績 {{score}} 分", { score: current })}
              </p>
            )}
            {row.answers.map((answer) => {
              const value = valueOf(answer);
              const label = isGroup ? (labels.get(answer.questionId)?.label ?? "") : t("workbench.scoreLabel", "分數");
              const aiValue =
                suggestionScores[answer.id]?.score ?? (row.source === "ai" ? answer.score : null);
              const update = (next: Partial<GradeDraft>) =>
                onDraftChange(answer.id, {
                  score: value?.score ?? 0,
                  feedback: value?.feedback ?? "",
                  ...next,
                });
              return (
                <div key={answer.id} className={styles.subForm}>
                  <WorkbenchScoreField
                    label={label}
                    max={answer.maxScore}
                    step={objective ? 1 : 0.5}
                    value={value?.score ?? null}
                    aiValue={aiValue}
                    disabled={busy}
                    onChange={(score) => update({ score })}
                  />
                  <TextArea
                    id={`feedback-${answer.id}`}
                    labelText={t("workbench.feedback", "評語（選填）")}
                    hideLabel={!isGroup}
                    placeholder={t("workbench.feedback", "評語（選填）")}
                    rows={3}
                    value={value?.feedback ?? ""}
                    disabled={busy}
                    onChange={(event) => update({ feedback: event.target.value })}
                  />
                </div>
              );
            })}
          </div>
          <ButtonSet className={styles.rowActions}>
            <Button kind="secondary" disabled={busy} onClick={onSecondary}>
              {pending ? t("workbench.skip", "略過建議") : t("workbench.cancel", "取消")}
            </Button>
            <Button kind="primary" disabled={busy} onClick={onPrimary}>
              {pending ? t("workbench.adoptNext", "採用並下一位") : t("workbench.saveNext", "儲存並下一位")}
            </Button>
          </ButtonSet>
        </div>
      )}
    </div>
  );
}
