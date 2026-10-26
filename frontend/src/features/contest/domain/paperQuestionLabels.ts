import type { ExamQuestion } from "@/core/entities/contest.entity";
import { labelForContestProblemOrder } from "./contestProblemOrderLabel";

type NumberedQuestion = Pick<ExamQuestion, "id" | "groupId" | "expandQuestionNumbers">;
interface PaperQuestionLabel {
  mainNumber: number;
  label: string;
  groupLabel?: string;
}

/** The paper-wide rule numbers grouped children separately or as subparts. */
export function buildPaperQuestionLabels(
  questions: readonly NumberedQuestion[],
  expandQuestionNumbers = questions[0]?.expandQuestionNumbers ?? false,
) {
  const labels = new Map<string, PaperQuestionLabel>();
  const ranges = new Map<string, { first: number; last: number }>();
  let mainNumber = 0;
  let childIndex = 0;
  let previousGroup: string | null | undefined;
  for (const question of questions) {
    const expanded = question.groupId && expandQuestionNumbers;
    if (!question.groupId || question.groupId !== previousGroup || expanded) {
      mainNumber += 1;
      childIndex = 0;
    }
    const suffix = question.groupId && !expanded
      ? `(${labelForContestProblemOrder(childIndex++).toLowerCase()})`
      : "";
    labels.set(question.id, { mainNumber, label: `${mainNumber}${suffix}` });
    if (question.groupId) {
      const range = ranges.get(question.groupId);
      ranges.set(question.groupId, { first: range?.first ?? mainNumber, last: mainNumber });
    }
    previousGroup = question.groupId;
  }
  for (const question of questions) {
    if (!question.groupId) continue;
    const range = ranges.get(question.groupId)!;
    labels.get(question.id)!.groupLabel = range.first === range.last
      ? String(range.first)
      : `${range.first}–${range.last}`;
  }
  return labels;
}

export function formatPaperQuestionLabel(label: string | number): string {
  return label === "" ? "" : `${label}.`;
}
