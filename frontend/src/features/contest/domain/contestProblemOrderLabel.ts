/** Visible label (A, …, Z, AA, AB, …) for a zero-based contest problem order.
 * Keep in sync with backend `label_for_contest_problem_order`.
 */
export function labelForContestProblemOrder(order: number): string {
  let label = "";
  let number = order + 1;
  while (number > 0) {
    number -= 1;
    label = String.fromCharCode(65 + (number % 26)) + label;
    number = Math.floor(number / 26);
  }
  return label;
}
