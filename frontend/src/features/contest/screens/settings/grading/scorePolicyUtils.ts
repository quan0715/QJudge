/**
 * Score policy display utilities.
 *
 * Mirrors backend ExamScoringService logic for display-only calculations.
 * The backend remains the source of truth — these helpers use backend-provided
 * `effectiveMaxScore` to compute displayed totals consistently.
 */
import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";

interface QuestionScoreInfo {
  maxScore: number;
  effectiveMaxScore?: number;
  scorePolicy?: ExamQuestionScorePolicy;
  /** Raw answer score (null = ungraded) */
  score?: number | null;
}

/**
 * Whether a question contributes to the total score.
 * Excluded and redistribute questions do not contribute.
 */
export function isCountedQuestion(
  scorePolicy: ExamQuestionScorePolicy | undefined,
): boolean {
  return scorePolicy !== "excluded" && scorePolicy !== "redistribute";
}

/**
 * Compute effective max possible score from a list of questions,
 * respecting score policies.
 *
 * - excluded: 0
 * - redistribute: 0 (points moved to targets)
 * - full_marks: uses maxScore (original question score; unaffected by redistribution)
 * - normal: uses effectiveMaxScore (includes redistribution bonus)
 */
export function computeEffectiveMaxTotal(
  questions: QuestionScoreInfo[],
): number {
  let total = 0;
  for (const q of questions) {
    if (!isCountedQuestion(q.scorePolicy)) continue;
    if (q.scorePolicy === "full_marks") {
      total += q.maxScore;
    } else {
      total += q.effectiveMaxScore ?? q.maxScore;
    }
  }
  return total;
}

/**
 * Compute a student's displayed total score from their answers,
 * respecting score policies and redistribution scaling.
 *
 * - excluded / redistribute: contributes 0
 * - full_marks: contributes maxScore (original score, regardless of answer)
 * - normal: if effectiveMaxScore differs from maxScore, scale the raw score
 */
export function computeStudentDisplayTotal(
  questions: QuestionScoreInfo[],
): number {
  let total = 0;
  for (const q of questions) {
    if (!isCountedQuestion(q.scorePolicy)) continue;

    if (q.scorePolicy === "full_marks") {
      total += q.maxScore;
      continue;
    }

    // normal policy
    if (q.score == null) continue;

    const effectiveMax = q.effectiveMaxScore ?? q.maxScore;
    if (q.maxScore > 0 && effectiveMax !== q.maxScore) {
      // Scale raw score proportionally
      total += q.score * (effectiveMax / q.maxScore);
    } else {
      total += q.score;
    }
  }
  return total;
}
