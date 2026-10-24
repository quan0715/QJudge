/** Complete grading units: siblings share context and one versioned rubric. */
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";
import type { GradingAnswerRow } from "../gradingTypes";
import { buildSeedGradeCsv, parseCsvContent, serializeCsvRows, stringifyAnswer } from "../gradeCsv";
import { gradeCsvFilename, type BatchQuestion } from "./batchGradingModel";

export interface BatchUnit {
  id: string;
  questions: ExamQuestion[];
  targets: BatchQuestion[];
  labels: Record<string, string>;
}
export interface BatchUnitManifest {
  id: string;
  question_ids: string[];
  context_file: string;
  context_sha256: string;
  rubric_file: string;
  rubric_version: string;
  rubric_sha256?: string;
}

export function buildGradingUnits(targets: readonly BatchQuestion[], questions: ExamQuestion[]): BatchUnit[] {
  const units = new Map<string, BatchUnit>();
  const labels = Object.fromEntries([...buildPaperQuestionLabels(questions)].map(([id, value]) => [id, `Q${value.label}`]));
  for (const target of targets.filter((q) => q.ungradedRows.length)) {
    const question = questions.find((q) => q.id === target.questionId);
    if (!question) throw new Error(`找不到 ${target.label} 的完整題目，請重新載入`);
    const id = question.groupId ? `group_${question.groupId}` : `question_${question.id}`;
    const unit = units.get(id) ?? {
      id, targets: [], labels,
      questions: questions.filter((q) => question.groupId ? q.groupId === question.groupId : q.id === question.id),
    };
    unit.targets.push(target);
    units.set(id, unit);
  }
  return [...units.values()];
}

export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function prepareGradingUnit(
  unit: BatchUnit, rows: readonly GradingAnswerRow[], teacherNote = "",
) {
  const definition = {
    schema_version: 2,
    grading_policy: "group-rubric-v1",
    unit_id: unit.id,
    teacher_note: teacherNote,
    questions: unit.questions.map((q) => ({
      question_id: q.id, group_id: q.groupId ?? null,
      label: unit.labels[q.id],
      question_type: q.questionType, max_score: q.score,
      prompt: q.gradingPrompt ?? q.prompt,
      reference_answer: q.correctAnswer ?? null,
      reference_document: q.referenceAnswerDocument ?? null,
      explanation: q.explanation,
    })),
  };
  // Scores/answers are deliberately excluded: every student and retry uses the same rubric.
  const version = await sha256(JSON.stringify(definition));
  const targetRows = unit.targets.flatMap((q) => q.ungradedRows);
  const students = new Set(targetRows.map((r) => r.studentId));
  const targetIds = new Set(targetRows.map((r) => r.id));
  const context = {
    ...definition, rubric_version: version,
    students: [...students].map((studentId) => ({
      student_id: studentId,
      answers: unit.questions.map((q) => {
        const row = rows.find((r) => r.studentId === studentId && r.questionId === q.id && !r.isAbsent);
        return {
          question_id: q.id, exam_answer_id: row?.id ?? null,
          answer: row ? stringifyAnswer(row.answerContent) : null,
          writable: !!row && targetIds.has(row.id),
        };
      }),
    })),
  };
  const content = JSON.stringify(context);
  const digest = await sha256(content);
  const manifest: BatchUnitManifest = {
    id: unit.id, question_ids: unit.targets.map((q) => q.questionId),
    context_file: `context_${unit.id}_${digest}.json`, context_sha256: digest,
    rubric_file: `rubric_${unit.id}_${version}.json`, rubric_version: version,
  };
  return { content, manifest };
}

export function buildUnitGradeCsv(rows: GradingAnswerRow[]): string {
  const [header, ...records] = parseCsvContent(buildSeedGradeCsv(rows));
  return serializeCsvRows([
    [...header, "rubric_version", "criterion_scores"],
    ...records.map((r) => [...r, "", ""]),
  ]);
}

/** The worker parses the first two lines; the grading rules live in the qjudge-exam-grading-sop skill. */
export function buildBatchRunPrompt(input: { contestId: string; units: BatchUnitManifest[] }): string {
  return [
    `batch_question_id: ${input.units.flatMap((u) => u.question_ids).join(",")}`,
    `batch_units: ${JSON.stringify(input.units)}`,
    `整批批改 contest_id: ${input.contestId}，依 qjudge-exam-grading-sop 的 Batch v2 contract 處理每個 unit。`,
  ].join("\n");
}
