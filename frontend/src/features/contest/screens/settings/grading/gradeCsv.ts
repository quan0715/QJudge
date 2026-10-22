import type { GradingAnswerRow } from "./gradingTypes";

/** Column order of the grade CSV the AI fills (`score`, `reason`) for one question. */
export const GRADE_CSV_COLUMNS = [
  "index",
  "exam_answer_id",
  "username",
  "answer_text",
  "original_score",
  "original_feedback",
  "score",
  "reason",
  "synced",
] as const;

export function stringifyAnswer(answer: Record<string, unknown>): string {
  const text = answer?.text;
  if (typeof text === "string" && text.trim()) return text;
  const selected = answer?.selected;
  if (typeof selected === "string" || typeof selected === "number") return String(selected);
  if (Array.isArray(selected)) return selected.join(", ");
  const code = answer?.code;
  if (typeof code === "string" && code.trim()) return code;

  try {
    return JSON.stringify(answer, null, 2);
  } catch {
    return "";
  }
}

export function encodeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function serializeCsvRows(rows: string[][]): string {
  return `${rows.map((row) => row.map(encodeCsvCell).join(",")).join("\n")}\n`;
}

export function buildSeedGradeCsv(rows: GradingAnswerRow[]): string {
  const cells = (row: GradingAnswerRow, index: number): Record<string, unknown> => ({
    index: index + 1,
    exam_answer_id: row.id,
    username: row.studentUsername,
    answer_text: stringifyAnswer(row.answerContent),
    original_score: row.score ?? "",
    original_feedback: row.feedback ?? "",
  });
  return serializeCsvRows([
    [...GRADE_CSV_COLUMNS],
    ...rows.map((row, index) => {
      const values = cells(row, index);
      return GRADE_CSV_COLUMNS.map((column) => String(values[column] ?? ""));
    }),
  ]);
}

export function parseCsvContent(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let fieldStarted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      fieldStarted = false;
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      fieldStarted = false;
    } else if (ch === "\r") {
      // handled by \n or trailing
    } else if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else {
      cur += ch;
      fieldStarted = true;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parse a CSV with a header row into records keyed by lower-cased header. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsvContent(text);
  if (!header) return [];
  const keys = header.map((cell) => cell.trim().toLowerCase());
  return rows.map((cells) =>
    Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""])),
  );
}
