import { describe, expect, it } from "vitest";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { getExamPublishIssues } from "./examPublishIssues";

const question = (overrides: Partial<ExamQuestion>): ExamQuestion => ({
  id: "q",
  contestId: "c",
  questionType: "single_choice",
  prompt: "Pick the capital",
  options: ["Taipei", "Tainan"],
  correctAnswer: 0,
  explanation: "",
  score: 5,
  order: 0,
  ...overrides,
});

describe("getExamPublishIssues", () => {
  it("lists objective questions without an answer by display number", () => {
    const issues = getExamPublishIssues([
      question({ order: 0 }),
      question({ order: 1, correctAnswer: null }),
      question({ order: 2, questionType: "multiple_choice", correctAnswer: [] }),
      question({ order: 3, questionType: "true_false", options: ["True", "False"], correctAnswer: undefined }),
      question({ order: 4, questionType: "essay", options: [], correctAnswer: null }),
    ]);

    expect(issues.missingAnswer).toEqual([2, 3, 4]);
  });

  it("lists questions still holding the editor's placeholder content", () => {
    const issues = getExamPublishIssues([
      question({ order: 0, prompt: "New question" }),
      question({ order: 1, options: ["Option A", "Taipei"] }),
      question({ order: 2, prompt: "  New question  ", questionType: "essay", options: [] }),
      question({ order: 3 }),
    ]);

    expect(issues.defaultContent).toEqual([1, 2, 3]);
  });

  it("matches editor and answering labels when stored orders have gaps", () => {
    const issues = getExamPublishIssues([
      question({ order: 7, correctAnswer: null, prompt: "New question" }),
      question({ order: 2 }),
    ]);
    expect(issues.missingAnswer).toEqual([8]);
    expect(issues.defaultContent).toEqual([8]);
  });

  it("returns no issues for a finished paper", () => {
    expect(getExamPublishIssues([question({})])).toEqual({ missingAnswer: [], defaultContent: [] });
  });
});
