import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";
export type ScorePolicyChoice = "normal" | "full_marks" | "excluded_lower" | "excluded_keep";
export function choiceFromPolicy(policy: ExamQuestionScorePolicy): ScorePolicyChoice {
  return policy === "redistribute" ? "excluded_keep" : policy === "excluded" ? "excluded_lower" : policy;
}
export function policyFromChoice(choice: ScorePolicyChoice): { policy: ExamQuestionScorePolicy; config?: { redistribute_to: string[] } } {
  if (choice === "excluded_keep") return { policy: "redistribute", config: { redistribute_to: [] } };
  return { policy: choice === "excluded_lower" ? "excluded" : choice };
}
export function redistributedScore(score: number, targetsTotal: number, movedScore: number): number {
  return Math.round((targetsTotal > 0 ? score * (targetsTotal + movedScore) / targetsTotal : score) * 100) / 100;
}
