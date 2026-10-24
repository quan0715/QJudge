import { describe, expect, it } from "vitest";
import type { ExamPaper, ExamQuestion } from "@/core/entities/contest.entity";
import { buildWorkbenchUnits } from "./gradingWorkbenchModel";

const question = (prompt: string) => ({ id: "q1", order: 0, prompt, questionType: "short_answer" }) as ExamQuestion;
const paperOf = (prompt: string) =>
  ({ questions: [question(prompt)], blocks: [{ kind: "question", id: "b1", question: question(prompt) }] }) as unknown as ExamPaper;

describe("buildWorkbenchUnits", () => {
  it("titles a question with its first line as plain text", () => {
    const [unit] = buildWorkbenchUnits(paperOf("## **Factorial**: compute x! = 1 \\* 2 \\* 3\nmore text"));
    expect(unit.title).toBe("Factorial: compute x! = 1 * 2 * 3");
  });
});
