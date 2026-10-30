import { Button, ButtonSet, Layer, Tag, TextArea } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import { isSubjectiveType, type GradingAnswerRow } from "../gradingTypes";
import { isCountedQuestion } from "../scorePolicyUtils";
import { correctOptionIndexes, selectedOptionIndexes } from "../objectiveRegrade";
import type { GradeDraft } from "./gradingWorkbenchModel";
import type { AnswerSource, WorkbenchStudentRow as Row } from "./workbenchRowModel";
import { WorkbenchScoreField } from "./WorkbenchScoreField";
import { compactScore } from "./workbenchStatsModel";
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
  aiDraftScores?: Record<string, GradeDraft>;
  busy: boolean;
  /** The AI is grading this row's unit; ungraded rows show it is working on them. */
  aiRunning?: boolean;
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
  unanswered: "outline",
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
  aiDraftScores = {},
  busy,
  aiRunning = false,
  onToggle,
  onDraftChange,
  onPrimary,
  onSecondary,
}: WorkbenchStudentRowProps) {
  const { t } = useTranslation("contest");
  const isGroup = questions.length > 1;
  const isObjective = (answer: GradingAnswerRow) => !isSubjectiveType(answer.questionType);
  const objective = questions.every((question) => !isSubjectiveType(question.questionType));
  const pending = row.source === "suggestion";
  const previewOf = (answer: GradingAnswerRow) => answer.score === null ? aiDraftScores[answer.id] : undefined;
  const hasAiDraft = !pending && row.answers.some((answer) => previewOf(answer));
  const aiGrading = aiRunning && row.source === "none" && !hasAiDraft;
  const previewScores = row.answers.map((answer) => answer.score ?? previewOf(answer)?.score);
  const previewTotal = previewScores.every((score) => score !== undefined)
    ? compactScore(previewScores.reduce<number>((sum, score) => sum + (score ?? 0), 0)) : "—";
  const valueOf = (answer: GradingAnswerRow): GradeDraft | null => {
    const draft = drafts[answer.id] ?? suggestionScores[answer.id];
    if (draft) return draft;
    return answer.score === null ? previewOf(answer) ?? null : { score: answer.score, feedback: answer.feedback };
  };
  const suggestedTotal = row.answers.reduce(
    (sum, answer) => sum + (suggestionScores[answer.id]?.score ?? answer.score ?? 0),
    0,
  );
  const current = row.total === null ? "—" : compactScore(row.total);
  const scoreText = pending ? `${current} → ${compactScore(suggestedTotal)}` : hasAiDraft ? previewTotal : current;
  const prefix = (answer: GradingAnswerRow) => (isGroup ? `${labels.get(answer.questionId)?.label ?? ""} ` : "");
  const picked = (answer: GradingAnswerRow) => {
    const texts = optionTexts(answer);
    const indexes = selectedOptionIndexes(answer);
    return indexes.length
      ? t("workbench.picked", "選 {{options}}", {
          options: indexes.map((index) => `${optionLabel(answer, index)}\u3000${texts[index] ?? ""}`).join("、"),
        })
      : t("workbench.noAnswer", "未作答");
  };
  const answerOf = new Map(row.answers.map((answer) => [answer.questionId, answer]));
  const unansweredNote = (question: ExamQuestion): { text: string; score: number | null } =>
    question.scorePolicy === "full_marks"
      ? { text: t("workbench.noAnswerFullMarks", "未作答，此題送分"), score: question.score }
      : isCountedQuestion(question.scorePolicy)
        ? { text: t("workbench.noAnswerZero", "未作答，以 0 分計"), score: 0 }
        : { text: t("workbench.noAnswerNotCounted", "未作答，此題不計分"), score: null };
  const noAnswer = t("workbench.noAnswer", "未作答");
  const missingText = (question: ExamQuestion) =>
    isGroup ? `${labels.get(question.id)?.label ?? ""} ${noAnswer}` : noAnswer;
  const summaryOf = (describe: (answer: GradingAnswerRow) => string) =>
    questions
      .map((question) => {
        const answer = answerOf.get(question.id);
        return answer ? describe(answer) : missingText(question);
      })
      .join("\u3000");
  const summary = objective
    ? summaryOf(picked)
    : row.source === "none" && !hasAiDraft && !row.answers.some((answer) => answer.feedback)
      ? t("workbench.ungradedSummary", "尚未批改")
      : summaryOf((answer) =>
          isObjective(answer)
            ? `${prefix(answer)}${picked(answer)}`
            : `${prefix(answer)}${suggestionScores[answer.id]?.feedback ?? previewOf(answer)?.feedback ?? answer.feedback}`,
        );
  const sourceText: Record<AnswerSource, string> = {
    auto: t("workbench.source.auto", "自動"),
    suggestion: t("workbench.source.suggestion", "建議"),
    none: t("workbench.source.none", "未批改"),
    ai: t("workbench.source.ai", "AI"),
    manual: t("workbench.source.manual", "人工確認"),
    unanswered: t("workbench.noAnswer", "未作答"),
  };

  return (
    <div className={aiGrading ? `${styles.studentRow} ${styles.rowAiGrading}` : styles.studentRow} data-expanded={expanded}>
      <button type="button" className={styles.rowButton} aria-expanded={expanded} onClick={onToggle}>
        <span className={styles.rowName}>{row.name}</span>
        <span className={pending ? styles.rowScorePending : styles.rowScore}>
          {aiGrading ? (
            <span className={styles.aiDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          ) : (
            scoreText
          )}
          <span className={styles.scoreMax}> / {compactScore(maxScore)}</span>
        </span>
        {aiGrading ? (
          <span className={styles.rowSummary}>
            <span className={styles.aiShimmer} aria-hidden="true" />
          </span>
        ) : (
          <span className={styles.rowSummary}>{summary}</span>
        )}
        {aiGrading ? (
          <Tag type="blue" size="sm">
            {t("workbench.aiGrading", "AI 批改中")}
          </Tag>
        ) : (
          <Tag
            type={hasAiDraft ? "purple" : TAG_TYPE[row.source]}
            size="sm"
            className={row.source === "suggestion" ? styles.suggestionTag : undefined}
          >
            {hasAiDraft ? t("workbench.source.aiDraft", "AI 草稿") : sourceText[row.source]}
          </Tag>
        )}
      </button>
      {expanded && (
        <Layer className={styles.rowDetail}>
          {pending && (
            <p className={styles.currentScore}>
              {t("workbench.currentScore", "目前成績 {{score}} 分", { score: current })}
            </p>
          )}
          {questions.map((question) => {
            const answer = answerOf.get(question.id);
            const subLabel = labels.get(question.id)?.label ?? "";
            if (!answer) {
              const note = unansweredNote(question);
              return (
                <section key={question.id} className={styles.answerBlock} aria-label={isGroup ? subLabel : undefined}>
                  {isGroup && <h4 className={styles.subLabel}>{subLabel}</h4>}
                  <p className={styles.unansweredNote}>
                    {note.text}
                    {note.score !== null && (
                      <span className={styles.muted}> {compactScore(note.score)} / {compactScore(question.score)}</span>
                    )}
                  </p>
                </section>
              );
            }
            const value = valueOf(answer);
            const label = isGroup ? subLabel : t("workbench.scoreLabel", "分數");
            const aiValue = suggestionScores[answer.id]?.score ?? previewOf(answer)?.score ?? (row.source === "ai" ? answer.score : null);
            const update = (next: Partial<GradeDraft>) =>
              onDraftChange(answer.id, {
                score: value?.score ?? 0,
                feedback: value?.feedback ?? "",
                ...next,
              });
            return (
              <section key={answer.id} className={styles.answerBlock} aria-label={isGroup ? subLabel : undefined}>
                {isGroup && <h4 className={styles.subLabel}>{subLabel}</h4>}
                <div className={styles.answerBody}>
                  <div className={styles.rowAnswer}>
                    {isObjective(answer) ? (
                      <ul className={styles.optionList}>
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
                      <AnswerDisplay
                        questionType={answer.questionType}
                        answerFormat={answer.answerFormat}
                        answerContent={answer.answerContent}
                        options={answer.questionOptions}
                        correctAnswer={null}
                        showCorrectness={false}
                      />
                    )}
                  </div>
                  <div className={styles.rowForm}>
                    <WorkbenchScoreField
                      label={label}
                      max={answer.maxScore}
                      step={isObjective(answer) ? 1 : 0.5}
                      value={value?.score ?? null}
                      aiValue={aiValue}
                      disabled={busy}
                      onChange={(score) => update({ score })}
                    />
                    <TextArea
                      id={`feedback-${answer.id}`}
                      labelText={t("workbench.feedback", "評語（選填）")}
                      hideLabel
                      placeholder={t("workbench.feedback", "評語（選填）")}
                      rows={3}
                      value={value?.feedback ?? ""}
                      disabled={busy}
                      onChange={(event) => update({ feedback: event.target.value })}
                    />
                  </div>
                </div>
              </section>
            );
          })}
          <ButtonSet className={styles.rowActions}>
            <Button kind="secondary" disabled={busy} onClick={onSecondary}>
              {pending ? t("workbench.skip", "略過建議") : t("workbench.cancel", "取消")}
            </Button>
            <Button kind="primary" disabled={busy} onClick={onPrimary}>
              {pending ? t("workbench.adoptNext", "採用並下一位") : t("workbench.saveNext", "儲存並下一位")}
            </Button>
          </ButtonSet>
        </Layer>
      )}
    </div>
  );
}
