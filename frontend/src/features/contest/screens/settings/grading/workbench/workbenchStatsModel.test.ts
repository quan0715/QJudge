import { describe, expect, it } from "vitest";
import type { GradingAnswerRow } from "../gradingTypes";
import type { WorkbenchStudentRow } from "./workbenchRowModel";
import { computeQuestionStats, countOptions } from "./workbenchStatsModel";

const row = (total: number | null): WorkbenchStudentRow => ({
  studentId: String(total),
  name: "",
  username: "",
  answers: [],
  total,
  source: total === null ? "none" : "ai",
});

const choice = (selected: unknown, over: Partial<GradingAnswerRow> = {}): GradingAnswerRow =>
  ({
    id: String(selected),
    questionType: "single_choice",
    questionOptions: ["Pass", "Good", "Fail", "None"],
    correctAnswer: 2,
    answerContent: { selected },
    maxScore: 4,
    ...over,
  }) as GradingAnswerRow;

describe("workbenchStatsModel", () => {
  it("averages only graded rows", () => {
    expect(computeQuestionStats([row(10), row(14), row(null)], 17)).toEqual({
      average: 12,
      rate: 12 / 17,
      graded: 2,
      total: 3,
    });
  });

  it("empty stats are null", () => {
    const stats = computeQuestionStats([row(null)], 17);
    expect(stats.average).toBeNull();
    expect(stats.rate).toBeNull();
  });

  it("counts single choice with correct flag", () => {
    expect(countOptions(["C", "B", "C", "A"].map((pick) => choice(pick)))).toEqual([
      { label: "A", count: 1, correct: false },
      { label: "B", count: 1, correct: false },
      { label: "C", count: 2, correct: true },
      { label: "D", count: 0, correct: false },
    ]);
  });

  it("counts true/false as 是/否", () => {
    const tf = (selected: unknown) => choice(selected, { questionType: "true_false", questionOptions: [], correctAnswer: true });
    expect(countOptions([tf(true), tf(false), tf("true")])).toEqual([
      { label: "是", count: 2, correct: true },
      { label: "否", count: 1, correct: false },
    ]);
  });

  it("counts each multiple-choice selection", () => {
    const multi = (selected: unknown) => choice(selected, { questionType: "multiple_choice", correctAnswer: [0, 2] });
    expect(countOptions([multi([0, 2]), multi(["A"])]).map((item) => [item.label, item.count, item.correct])).toEqual([
      ["A", 2, true],
      ["B", 0, false],
      ["C", 1, true],
      ["D", 0, false],
    ]);
  });
});
