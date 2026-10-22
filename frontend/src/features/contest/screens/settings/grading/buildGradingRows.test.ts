import { describe, expect, it } from "vitest";
import { mapExamQuestionDto } from "@/infrastructure/mappers/contest.mapper";
import { buildGradingRows } from "./buildGradingRows";

const answer = {
  id: "a1", questionId: "q1", participantUserId: "s1",
  answer: { text: "student code" }, score: null, feedback: "",
  gradedByUsername: null, gradedAt: null,
};

describe("grading question context", () => {
  it("shows shared instructions while keeping the editable child prompt separate", () => {
    const question = mapExamQuestionDto({
      id: "q1", prompt: "Check primes", question_type: "essay", score: 5,
      grading_prompt: "### Loop task\n\nNo libraries.\n\n---\n\nCheck primes",
    });
    const [row] = buildGradingRows([answer], [question]);
    expect(row.questionPrompt).toContain("No libraries.");
    expect(row.questionPrompt).toContain("Check primes");
    expect(question.prompt).toBe("Check primes");
  });

  it("preserves standalone prompts and supports older API responses", () => {
    const question = mapExamQuestionDto({ id: "q1", prompt: "Standalone" });
    expect(buildGradingRows([answer], [question])[0].questionPrompt).toBe("Standalone");
  });
});

it("labels grouped answers from the full paper even when answers are missing or reordered", () => {
  const questions = [
    { id: "q1", group_id: "g", order: 0 },
    { id: "q2", group_id: "g", order: 1 },
    { id: "q3", order: 2 },
  ].map(mapExamQuestionDto);
  const rows = buildGradingRows([
    { ...answer, id: "a3", questionId: "q3" },
    { ...answer, id: "a2", questionId: "q2" },
  ], questions);
  expect(rows.map(row => [row.questionId, row.questionLabel, row.questionIndex])).toEqual([
    ["q3", "2", 3], ["q2", "1(b)", 2],
  ]);
});
