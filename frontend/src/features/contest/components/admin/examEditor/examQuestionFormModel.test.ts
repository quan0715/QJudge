import { describe, expect, it } from "vitest";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import {
  buildDuplicatePayload,
  buildPayload,
  getQuestionValidationError,
  toFormState,
} from "./examQuestionFormModel";
const question: ExamQuestion = {
  id: "q",
  contestId: "c",
  questionType: "single_choice",
  prompt: "Choose",
  options: ["A", "B"],
  correctAnswer: 0,
  explanation: "",
  score: 5,
  order: 0,
  createdAt: "",
  updatedAt: "",
};
describe("shared question form", () => {
  it("roundtrips a single choice answer", () =>
    expect(buildPayload(toFormState(question)).correct_answer).toBe(0));
  it("preserves an existing markdown answer format", () =>
    expect(
      buildPayload(
        toFormState({
          ...question,
          questionType: "essay",
          answerFormat: "markdown_math",
          options: [],
          correctAnswer: "answer",
        }),
      ).answer_format,
    ).toBe("markdown_math"));
  it.each([
    [{ prompt: " " }, "emptyPrompt"],
    [{ score: "0" }, "invalidScore"],
    [{ options: ["A"] }, "minOptions"],
    [{ options: ["A", " "] }, "blankOption"],
    [{}, null],
  ])("validates the form %j", (patch, expected) =>
    expect(
      getQuestionValidationError(
        { ...toFormState(question), ...patch },
        { requireScore: true },
      ),
    ).toBe(expected),
  );
  it("does not require a score for a scoreless form", () =>
    expect(
      getQuestionValidationError(
        { ...toFormState(question), score: "0" },
        { requireScore: false },
      ),
    ).toBeNull());
  it("duplicates options and answer indexes without sharing arrays", () => {
    const source = {
      ...question,
      questionType: "multiple_choice" as const,
      correctAnswer: [0, 1],
    };
    const copy = buildDuplicatePayload(source, 3);
    expect(copy.order).toBe(3);
    expect(copy.options).toEqual(["A", "B"]);
    expect(copy.options).not.toBe(source.options);
    expect(copy.correct_answer).toEqual([0, 1]);
    expect(copy.correct_answer).not.toBe(source.correctAnswer);
  });
});
