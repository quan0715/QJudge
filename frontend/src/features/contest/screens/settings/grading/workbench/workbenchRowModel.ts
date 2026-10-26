import type { GradingAnswerRow } from "../gradingTypes";
import type { GradingWorkbenchUnit } from "./gradingWorkbenchModel";

export type AnswerSource = "auto" | "suggestion" | "none" | "ai" | "manual";

export interface SuggestionLike {
  score: number | null;
  reason: string;
  synced: boolean;
}

export interface SourceContext {
  suggestions: Readonly<Record<string, SuggestionLike>>;
}

export interface WorkbenchStudentRow {
  studentId: string;
  name: string;
  username: string;
  /** Ordered by the unit's questions; absent answers excluded. */
  answers: GradingAnswerRow[];
  /** Null while any child answer is ungraded. */
  total: number | null;
  source: AnswerSource;
}

export type ScoreFilter = "all" | "zero" | "partial" | "full";
export type SourceFilter = "all" | AnswerSource;
export type RowSort = "seat" | "asc" | "desc";

/** A student row shows the most attention-worthy source among its answers. */
const SOURCE_PRIORITY: readonly AnswerSource[] = ["suggestion", "none", "manual", "ai", "auto"];

export function isPendingSuggestion(row: GradingAnswerRow, suggestion?: SuggestionLike): boolean {
  if (!suggestion || suggestion.score === null || suggestion.synced) return false;
  return row.score === null || suggestion.score !== row.score || suggestion.reason !== row.feedback;
}

export function resolveAnswerSource(row: GradingAnswerRow, ctx: SourceContext): AnswerSource {
  if (row.isAutoGraded) return "auto";
  const suggestion = ctx.suggestions[row.id];
  if (isPendingSuggestion(row, suggestion)) return "suggestion";
  if (row.score === null) return "none";
  if (row.isAiGraded) return "ai";
  return "manual";
}

export function buildStudentRows(
  unit: GradingWorkbenchUnit,
  answers: readonly GradingAnswerRow[],
  ctx: SourceContext,
): WorkbenchStudentRow[] {
  const order = new Map(unit.questions.map((question, index) => [question.id, index]));
  const byStudent = new Map<string, GradingAnswerRow[]>();
  for (const row of answers) {
    if (row.isAbsent || !order.has(row.questionId)) continue;
    byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row]);
  }
  return [...byStudent.values()].map((rows) => {
    const sorted = rows.sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0));
    const sources = sorted.map((row) => resolveAnswerSource(row, ctx));
    const complete = sorted.length === unit.questions.length && sorted.every((row) => row.score !== null);
    return {
      studentId: sorted[0].studentId,
      name: sorted[0].studentDisplayName || sorted[0].studentUsername,
      username: sorted[0].studentUsername,
      answers: sorted,
      total: complete ? sorted.reduce((sum, row) => sum + (row.score ?? 0), 0) : null,
      source: SOURCE_PRIORITY.find((source) => sources.includes(source)) ?? "none",
    };
  });
}

function band(total: number | null, maxScore: number): ScoreFilter | null {
  if (total === null) return null;
  if (total === 0) return "zero";
  return total === maxScore ? "full" : "partial";
}

export function filterStudentRows(
  rows: readonly WorkbenchStudentRow[],
  filter: { score: ScoreFilter; source: SourceFilter; search: string },
  maxScore: number,
): WorkbenchStudentRow[] {
  const query = filter.search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.score === "all" || band(row.total, maxScore) === filter.score) &&
      (filter.source === "all" || row.source === filter.source) &&
      (!query || `${row.name} ${row.username}`.toLowerCase().includes(query)),
  );
}

export function sortStudentRows(rows: readonly WorkbenchStudentRow[], sort: RowSort): WorkbenchStudentRow[] {
  if (sort === "seat") return [...rows];
  return [...rows].sort((a, b) => {
    if (a.total === null) return b.total === null ? 0 : 1;
    if (b.total === null) return -1;
    return sort === "asc" ? a.total - b.total : b.total - a.total;
  });
}
