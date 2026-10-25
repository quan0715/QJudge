import { expect, it } from "vitest";
import type { GradingAnswerRow } from "../../grading/gradingTypes";
import { summarizeQuestionAnswers } from "./questionAnswerSummary";
it("summarises graded answers including zero scores", () => {
  expect(
    summarizeQuestionAnswers(
      [{ score: 10 }, { score: 5 }, { score: null }] as GradingAnswerRow[],
      10,
    ),
  ).toEqual({ graded: 2, total: 3, average: 7.5, rate: 0.75 });
  expect(
    summarizeQuestionAnswers([{ score: 0 }] as GradingAnswerRow[], 10),
  ).toEqual({ graded: 1, total: 1, average: 0, rate: 0 });
});
it("has no average or rate without graded answers", () =>
  expect(summarizeQuestionAnswers([], 10)).toEqual({
    graded: 0,
    total: 0,
    average: null,
    rate: null,
  }));
