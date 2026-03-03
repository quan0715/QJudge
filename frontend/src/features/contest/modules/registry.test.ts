import { describe, expect, it } from "vitest";
import { getContestTypeModule } from "@/features/contest/modules/registry";

describe("contest type module registry", () => {
  it("returns coding module by default", () => {
    const module = getContestTypeModule(undefined);
    expect(module.type).toBe("coding");
    expect(module.student.problemsViewKind).toBe("coding");
    expect(module.admin.examEditorKind).toBe("coding");
  });

  it("returns paper exam module for paper_exam contests", () => {
    const module = getContestTypeModule("paper_exam");
    expect(module.type).toBe("paper_exam");
    expect(module.student.problemsViewKind).toBe("paper_exam");
    expect(module.admin.examEditorKind).toBe("paper_exam");
    expect(module.admin.shouldShowExamJsonActions("exam")).toBe(true);
    expect(module.admin.shouldShowExamJsonActions("overview")).toBe(false);
  });
});
