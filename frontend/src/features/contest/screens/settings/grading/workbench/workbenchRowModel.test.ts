import { describe, expect, it } from "vitest";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { GradingAnswerRow } from "../gradingTypes";
import type { GradingWorkbenchUnit } from "./gradingWorkbenchModel";
import {
  buildStudentRows,
  filterStudentRows,
  isPendingSuggestion,
  resolveAnswerSource,
  sortStudentRows,
  type SourceContext,
  type WorkbenchStudentRow,
} from "./workbenchRowModel";

const answer = (over: Partial<GradingAnswerRow>): GradingAnswerRow =>
  ({
    id: "1",
    studentId: "s1",
    studentUsername: "preview_01",
    studentDisplayName: "模擬學生 01",
    questionId: "q",
    questionIndex: 1,
    questionPrompt: "",
    questionType: "short_answer",
    questionOptions: [],
    maxScore: 17,
    answerContent: {},
    score: null,
    feedback: "",
    gradedBy: null,
    gradedAt: null,
    isAutoGraded: false,
    correctAnswer: null,
    ...over,
  }) as GradingAnswerRow;

const emptyCtx: SourceContext = { suggestions: {} };

const unit = (ids: string[]): GradingWorkbenchUnit => ({
  id: "u",
  label: "1",
  title: "t",
  sharedStem: "",
  questions: ids.map((id) => ({ id, score: 17 }) as ExamQuestion),
});

const studentRow = (studentId: string, total: number | null, username = studentId): WorkbenchStudentRow => ({
  studentId,
  name: studentId,
  username,
  answers: [],
  total,
  source: total === null ? "none" : "ai",
});

describe("workbenchRowModel", () => {
  it("resolves sources in priority order", () => {
    const ctx: SourceContext = {
      suggestions: {
        sugg: { score: 5, reason: "new", synced: false },
        synced: { score: 3, reason: "ok", synced: true },
      },
    };
    expect(resolveAnswerSource(answer({ id: "auto", isAutoGraded: true, score: 4 }), ctx)).toBe("auto");
    expect(resolveAnswerSource(answer({ id: "sugg", score: 2, feedback: "old" }), ctx)).toBe("suggestion");
    expect(resolveAnswerSource(answer({ id: "none" }), ctx)).toBe("none");
    expect(resolveAnswerSource(answer({ id: "ai", score: 2, isAiGraded: true }), ctx)).toBe("ai");
    expect(resolveAnswerSource(answer({ id: "synced", score: 3, feedback: "ok" }), ctx)).toBe("manual");
    expect(resolveAnswerSource(answer({ id: "other", score: 3 }), ctx)).toBe("manual");
  });

  it("shows persisted AI provenance without the grading owner's session", () => {
    expect(resolveAnswerSource(answer({ score: 3, isAiGraded: true }), emptyCtx)).toBe("ai");
    expect(resolveAnswerSource(answer({ score: null, isAiGraded: true }), emptyCtx)).toBe("none");
  });

  it("identical suggestion is not pending", () => {
    const row = answer({ score: 12, feedback: "x" });
    const suggestion = { score: 12, reason: "x", synced: false };
    expect(isPendingSuggestion(row, suggestion)).toBe(false);
    expect(resolveAnswerSource(row, { ...emptyCtx, suggestions: { "1": suggestion } })).toBe("manual");
  });

  it("total is null when any child ungraded", () => {
    const rows = buildStudentRows(
      unit(["a", "b"]),
      [answer({ id: "1", questionId: "a", score: 2 }), answer({ id: "2", questionId: "b", score: null })],
      emptyCtx,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBeNull();
    expect(rows[0].source).toBe("none");
  });

  it("counts an unanswered group child as zero instead of leaving the row incomplete", () => {
    const rows = buildStudentRows(unit(["a", "b"]), [answer({ id: "1", questionId: "a", score: 1 })], emptyCtx);
    expect(rows[0].answers.map((row) => row.questionId)).toEqual(["a"]);
    expect(rows[0].total).toBe(1);
  });

  it("adds a zero-point row for exam takers who answered nothing in the unit", () => {
    const rows = buildStudentRows(
      unit(["a", "b"]),
      [answer({ id: "1", studentId: "s1", questionId: "a", score: 1 })],
      emptyCtx,
      [{ studentId: "s1", username: "s1" }, { studentId: "s2", username: "blank", displayName: "空白卷" }],
    );
    expect(rows.map((row) => [row.studentId, row.name, row.total, row.source])).toEqual([
      ["s1", "模擬學生 01", 1, "manual"],
      ["s2", "空白卷", 0, "unanswered"],
    ]);
  });

  it("orders answers by unit question order and sums totals", () => {
    const rows = buildStudentRows(
      unit(["a", "b"]),
      [answer({ id: "2", questionId: "b", score: 3.5 }), answer({ id: "1", questionId: "a", score: 2 })],
      emptyCtx,
    );
    expect(rows[0].answers.map((row) => row.questionId)).toEqual(["a", "b"]);
    expect(rows[0].total).toBe(5.5);
    expect(rows[0].source).toBe("manual");
  });

  it("absent rows are excluded", () => {
    const rows = buildStudentRows(
      unit(["a"]),
      [
        answer({ id: "1", studentId: "s1", questionId: "a", score: 1 }),
        answer({ id: "2", studentId: "s2", questionId: "a", isAbsent: true }),
      ],
      emptyCtx,
    );
    expect(rows.map((row) => row.studentId)).toEqual(["s1"]);
  });

  it("filters by band, source and search", () => {
    const rows = [studentRow("a", 0), studentRow("b", 8.5), studentRow("c", 17), studentRow("d", null, "preview_05")];
    const run = (f: Partial<Parameters<typeof filterStudentRows>[1]>) =>
      filterStudentRows(rows, { score: "all", source: "all", search: "", ...f }, 17).map((row) => row.studentId);
    expect(run({ score: "zero" })).toEqual(["a"]);
    expect(run({ score: "partial" })).toEqual(["b"]);
    expect(run({ score: "full" })).toEqual(["c"]);
    expect(run({ source: "none" })).toEqual(["d"]);
    expect(run({ search: "PREVIEW_0" })).toEqual(["d"]);
  });

  it("sorts with null last", () => {
    const rows = [studentRow("n", null), studentRow("c", 17), studentRow("a", 0), studentRow("b", 8.5)];
    expect(sortStudentRows(rows, "asc").map((row) => row.total)).toEqual([0, 8.5, 17, null]);
    expect(sortStudentRows(rows, "desc").map((row) => row.total)).toEqual([17, 8.5, 0, null]);
    expect(sortStudentRows(rows, "seat").map((row) => row.studentId)).toEqual(["n", "c", "a", "b"]);
  });
});
