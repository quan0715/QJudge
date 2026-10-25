import type {
  ExamQuestion,
  ExamQuestionScorePolicy,
} from "@/core/entities/contest.entity";
export type ScorePolicyChoice =
  "normal" | "full_marks" | "excluded_lower" | "excluded_keep";
export function choiceFromPolicy(
  policy: ExamQuestionScorePolicy,
): ScorePolicyChoice {
  return policy === "redistribute"
    ? "excluded_keep"
    : policy === "excluded"
      ? "excluded_lower"
      : policy;
}
export function policyFromChoice(choice: ScorePolicyChoice): {
  policy: ExamQuestionScorePolicy;
  config?: { redistribute_to: string[] };
} {
  if (choice === "excluded_keep")
    return { policy: "redistribute", config: { redistribute_to: [] } };
  return { policy: choice === "excluded_lower" ? "excluded" : choice };
}
export function redistributedScore(
  score: number,
  targetsTotal: number,
  movedScore: number,
): number {
  return (
    Math.round(
      (targetsTotal > 0
        ? (score * (targetsTotal + movedScore)) / targetsTotal
        : score) * 100,
    ) / 100
  );
}

/** Points contributed to the paper total; redistributed sources are counted at their targets. */
export function paperQuestionPoints(
  question: Pick<ExamQuestion, "score" | "effectiveMaxScore" | "scorePolicy">,
): number {
  if (
    question.scorePolicy === "excluded" ||
    question.scorePolicy === "redistribute"
  )
    return 0;
  return question.scorePolicy === "full_marks"
    ? question.score
    : (question.effectiveMaxScore ?? question.score);
}
