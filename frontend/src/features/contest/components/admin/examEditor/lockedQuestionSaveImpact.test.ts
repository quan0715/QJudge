import { describe, expect, it } from "vitest";

import {
  classifyLockedQuestionSave,
  type LockedQuestionComparableState,
} from "./lockedQuestionSaveImpact";

const objectiveBefore: LockedQuestionComparableState = {
  questionType: "single_choice",
  score: "5",
  singleAnswerIndex: "0",
  multiAnswerIndexes: [],
  essayReferenceAnswer: "",
  shortAnswer: "",
  referenceAnswerDocument: null,
  explanation: "Old explanation",
  explanationDocument: null,
};

const essayBefore: LockedQuestionComparableState = {
  ...objectiveBefore,
  questionType: "essay",
  score: "10",
  singleAnswerIndex: "",
  essayReferenceAnswer: "Old rubric",
};

describe("classifyLockedQuestionSave", () => {
  it("requires regrading when an objective answer changes", () => {
    expect(
      classifyLockedQuestionSave(
        objectiveBefore,
        { ...objectiveBefore, singleAnswerIndex: "1" },
        18,
      ),
    ).toEqual({ kind: "objective-regrade", affectedCount: 18 });
  });

  it("offers subjective review handling when a rubric changes", () => {
    expect(
      classifyLockedQuestionSave(
        essayBefore,
        { ...essayBefore, essayReferenceAnswer: "New rubric" },
        7,
      ),
    ).toEqual({ kind: "subjective-review", affectedCount: 7 });
  });

  it("classifies explanation-only edits as display-only", () => {
    expect(
      classifyLockedQuestionSave(
        essayBefore,
        { ...essayBefore, explanation: "Corrected explanation" },
        7,
      ),
    ).toEqual({ kind: "display-only", affectedCount: 0 });
  });

  it("returns no-op for identical values", () => {
    expect(classifyLockedQuestionSave(essayBefore, essayBefore, 7)).toEqual({
      kind: "no-op",
      affectedCount: 0,
    });
  });
});
