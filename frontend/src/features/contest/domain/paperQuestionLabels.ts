import type { ExamQuestion } from "@/core/entities/contest.entity";
import { labelForContestProblemOrder } from "./contestProblemOrderLabel";

/** Number main questions once per contiguous group; keep IDs and answer order unchanged. */
export function buildPaperQuestionLabels(questions: readonly Pick<ExamQuestion, "id" | "groupId">[]) {
  const labels = new Map<string, { mainNumber: number; label: string }>();
  let mainNumber = 0;
  let childIndex = 0;
  let previousGroup: string | null | undefined;
  for (const question of questions) {
    if (!question.groupId || question.groupId !== previousGroup) {
      mainNumber += 1;
      childIndex = 0;
    }
    const suffix = question.groupId
      ? `(${labelForContestProblemOrder(childIndex++).toLowerCase()})`
      : "";
    labels.set(question.id, { mainNumber, label: `${mainNumber}${suffix}` });
    previousGroup = question.groupId;
  }
  return labels;
}
