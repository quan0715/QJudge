import type { ExamQuestion } from "@/core/entities/contest.entity";

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
