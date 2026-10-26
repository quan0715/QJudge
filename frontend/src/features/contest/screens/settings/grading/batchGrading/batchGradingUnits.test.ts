import { describe, expect, it } from "vitest";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { GradingAnswerRow } from "../gradingTypes";
import { selectBatchQuestions } from "./batchGradingModel";
import { buildBatchRunPrompt, buildGradingUnits } from "./batchGradingUnits";

const qs = ["a", "b", "c", "d", "e"].map((id, i) => ({
  id, groupId: i > 1 ? "group" : null, prompt: id, questionType: "short_answer", score: 3, order: i,
})) as ExamQuestion[];
const rows = qs.flatMap((q) => ["s1", "s2"].map((s) => ({
  id: `${s}-${q.id}`, studentId: s, questionId: q.id, questionGroupId: q.groupId, questionIndex: q.order + 1,
  questionType: q.questionType, maxScore: q.score, score: null, answerContent: { text: s },
}))) as GradingAnswerRow[];

describe("grading units", () => {
  it("keeps a question group in one unit", () => {
    const units = buildGradingUnits(selectBatchQuestions(rows), qs);
    expect(units.map((unit) => unit.question_ids)).toEqual([["a"], ["b"], ["c", "d", "e"]]);
  });

  it("carries the teacher's note and only the requested questions", () => {
    const [unit] = buildGradingUnits(selectBatchQuestions(rows).filter((q) => q.questionId === "d"), qs, "loop is one point");
    expect(unit).toMatchObject({ id: "group_group", question_ids: ["d"], teacher_note: "loop is one point" });
  });

  it("asks in one units line plus the teacher-facing question names", () => {
    const units = buildGradingUnits(selectBatchQuestions(rows).filter((q) => ["a", "c"].includes(q.questionId)), qs);
    const [line, words] = buildBatchRunPrompt(units).split("\n");
    expect(JSON.parse(line.slice("batch_units: ".length))).toEqual(units);
    expect(words).toBe(`請批改${units.map((unit) => unit.label).join("、")}。`);
  });
});
