import { describe, expect, it } from "vitest";
import type { GradingAnswerRow } from "./gradingTypes";
import { buildSeedGradeCsv, parseCsvContent, serializeCsvRows } from "./gradeCsv";

const row = (overrides: Partial<GradingAnswerRow>): GradingAnswerRow =>
  ({
    id: "a1",
    studentUsername: "s1",
    answerContent: { text: "答案" },
    score: null,
    feedback: "",
    ...overrides,
  }) as GradingAnswerRow;

describe("gradeCsv", () => {
  it("parses quoted cells with commas and newlines", () => {
    expect(parseCsvContent('a,b\n"x, y","line1\nline2"\n')).toEqual([
      ["a", "b"],
      ["x, y", "line1\nline2"],
    ]);
  });

  it("round-trips through serializeCsvRows", () => {
    const rows = [["h1", "h2"], ['say "hi"', "多行\n文字"]];
    expect(parseCsvContent(serializeCsvRows(rows))).toEqual(rows);
  });

  it("builds the seed grade csv with the fixed column order", () => {
    const csv = buildSeedGradeCsv([
      row({ id: "a1", studentUsername: "s1", answerContent: { text: "答案一" }, score: 3, feedback: "舊" }),
    ]);

    expect(parseCsvContent(csv)).toEqual([
      ["index", "exam_answer_id", "username", "answer_text", "original_score",
        "original_feedback", "score", "reason", "synced"],
      ["1", "a1", "s1", "答案一", "3", "舊", "", "", ""],
    ]);
  });
});
