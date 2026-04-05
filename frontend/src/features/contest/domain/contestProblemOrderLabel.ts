/**
 * Visible label (A, B, …) for a coding contest problem at a given sort index.
 * Keep in sync with backend `ContestQuestionBinding.label` / `ContestProblem.label`.
 */
export function labelForContestProblemOrder(order: number): string {
  if (order < 26) {
    return String.fromCharCode(65 + order);
  }
  return `P${order + 1}`;
}
