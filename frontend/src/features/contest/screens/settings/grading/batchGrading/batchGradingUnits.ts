/** Grading units: a standalone question, or a complete question group graded together. */
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";
import type { BatchQuestion } from "./batchGradingModel";

export interface BatchUnitManifest {
  id: string;
  label: string;
  question_ids: string[];
  teacher_note?: string;
}

/** Units for the questions that still have ungraded answers; a group is never split. */
export function buildGradingUnits(
  targets: readonly BatchQuestion[],
  questions: readonly ExamQuestion[],
  teacherNote?: string,
): BatchUnitManifest[] {
  const labels = buildPaperQuestionLabels([...questions]);
  const units = new Map<string, BatchUnitManifest>();
  for (const target of targets.filter((q) => q.ungradedRows.length)) {
    const question = questions.find((q) => q.id === target.questionId);
    if (!question) throw new Error(`找不到 ${target.label} 的完整題目，請重新載入`);
    const id = question.groupId ? `group_${question.groupId}` : `question_${question.id}`;
    const unit = units.get(id) ?? {
      id,
      label: `${labels.get(question.id)?.groupLabel ?? labels.get(question.id)?.label ?? target.label}.`,
      question_ids: [],
      ...(teacherNote ? { teacher_note: teacherNote } : {}),
    };
    unit.question_ids.push(target.questionId);
    units.set(id, unit);
  }
  return [...units.values()];
}

/** The worker reads the `batch_units:` line; the agent reads the request and decides how to grade. */
export function buildBatchRunPrompt(units: readonly BatchUnitManifest[]): string {
  return [`batch_units: ${JSON.stringify(units)}`, `請批改${units.map((unit) => unit.label).join("、")}。`].join("\n");
}
