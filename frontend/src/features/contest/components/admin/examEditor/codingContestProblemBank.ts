import type { ContestProblemSummary } from "@/core/entities/contest.entity";

export function isContestProblemLinkedToBank(
  problem: Pick<ContestProblemSummary, "sourceBank" | "sourceMode">,
): boolean {
  return (
    !!problem.sourceBank
    || problem.sourceMode === "copy"
    || problem.sourceMode === "reference"
  );
}
