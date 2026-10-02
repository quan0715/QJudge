import { describe, expect, it } from "vitest";
import type {
  ContestProblemSummary,
  ExamPaperBlock,
  ExamQuestion,
  ExamQuestionGroup,
} from "@/core/entities/contest.entity";
import { codingProblemPageContext, examBlockPageContext } from "./editorPageContext";

describe("codingProblemPageContext", () => {
  it("names the problem and carries both ids", () => {
    const problem = {
      id: "binding-1",
      problemId: "problem-1",
      label: "A",
      title: "A+B",
    } as ContestProblemSummary;

    expect(codingProblemPageContext(problem)).toEqual({
      type: "problem",
      label: "A. A+B",
      ids: { binding_id: "binding-1", problem_id: "problem-1" },
    });
  });
});

describe("examBlockPageContext", () => {
  it("uses the question id and a plain-text prompt", () => {
    const block: ExamPaperBlock = {
      kind: "question",
      id: "block-1",
      question: { id: "q-1", prompt: "## 什麼是 *stack*？\n請說明" } as ExamQuestion,
    };

    expect(examBlockPageContext(block, 2, "題組")).toEqual({
      type: "problem",
      label: "3. 什麼是 stack？請說明",
      ids: { question_id: "q-1" },
    });
  });

  it("falls back to a numbered label for an empty prompt", () => {
    const block: ExamPaperBlock = {
      kind: "question",
      id: "block-1",
      question: { id: "q-1", prompt: "" } as ExamQuestion,
    };

    expect(examBlockPageContext(block, 0, "題組").label).toBe("1. Question 1");
  });

  it("uses the group id and fallback title for a group", () => {
    const block: ExamPaperBlock = {
      kind: "group",
      id: "block-2",
      group: { id: "g-1", title: "" } as ExamQuestionGroup,
      children: [],
    };

    expect(examBlockPageContext(block, 0, "題組")).toEqual({
      type: "problem",
      label: "1. 題組",
      ids: { group_id: "g-1" },
    });
  });
});
