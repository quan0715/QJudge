import { parseCsvRecords } from "../gradeCsv";
import type { CopilotMessage } from "@copilot";

export interface GradeCsvProgress { filled: number; total: number }

export function countGradeCsvProgress(csv: string): GradeCsvProgress {
  const rows = new Map<string, string>();
  for (const row of parseCsvRecords(csv)) {
    const id = row.exam_answer_id?.trim();
    // Existing teacher grades are not part of the AI's writable workload.
    if (!id || row.original_score?.trim()) continue;
    rows.set(id, row.score?.trim() ?? "");
  }
  return {
    total: rows.size,
    filled: [...rows.values()].filter((score) => score !== "" && Number.isFinite(Number(score)) && Number(score) >= 0).length,
  };
}

/** Completed file operations only: streaming tokens never trigger a download. */
export function gradeCsvChangeKey(messages: readonly CopilotMessage[]): string {
  return messages.flatMap((message) => message.parts.flatMap((part) => {
    if (part.type !== "tool" || part.state !== "output-ready") return [];
    if (part.toolName === "get_grading_assignment") return [part.toolCallId];
    const input = part.input as Record<string, unknown> | undefined;
    const filename = typeof input?.filename === "string" ? input.filename : "";
    if (!/^grade_.+\.csv$/.test(filename) || !["artifact_csv_patch", "artifact_write_csv", "artifact_write", "artifact_csv_from_json"].includes(part.toolName)) return [];
    return [part.toolCallId];
  })).join(",");
}

export function gradingActivity(progress: Record<string, GradeCsvProgress>, ids: string[]) {
  const available = ids.map((id) => progress[id]);
  if (available.some((item) => !item)) return { progress: 0, label: "讀取 CSV 進度" };
  const total = available.reduce((sum, item) => sum + item.total, 0);
  const filled = available.reduce((sum, item) => sum + item.filled, 0);
  return { progress: total ? filled / total * 100 : 0, label: `CSV 已填 ${filled}/${total}` };
}
