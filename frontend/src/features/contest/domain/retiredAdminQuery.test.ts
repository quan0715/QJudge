import { describe, expect, it } from "vitest";
import { resolveRetiredAdminQuery } from "./retiredAdminQuery";

describe("retired admin page links", () => {
  it("opens the paper editor without stale grading selections overriding edit mode", () => {
    const original = new URLSearchParams("panel=problem_editor&grading_question=q&grading_student=s&edit_item=child&ai_session_id=session");
    const next = resolveRetiredAdminQuery(original, "paper_exam");
    expect(next?.get("panel")).toBe("grading-workbench");
    expect(next?.get("workbench_mode")).toBe("edit");
    expect(next?.has("grading_question")).toBe(false);
    expect(next?.has("grading_student")).toBe(false);
    expect(next?.get("edit_item")).toBe("child");
    expect(next?.get("ai_session_id")).toBe("session");
    expect(original.get("panel")).toBe("problem_editor");
  });

  it.each(["grading", "ai-grading"])("opens %s in the grading workbench with its selection", (panel) => {
    const next = resolveRetiredAdminQuery(new URLSearchParams(`panel=${panel}&grading_question=q&grading_student=s`), "paper_exam");
    expect(next?.get("panel")).toBe("grading-workbench");
    expect(next?.get("workbench_mode")).toBe("grade");
    expect(next?.get("grading_question")).toBe("q");
    expect(next?.get("grading_student")).toBe("s");
  });

  it("maps the old AI question selector and preserves session identity", () => {
    const next = resolveRetiredAdminQuery(new URLSearchParams("panel=ai-grading&ai_grading_question=q2&grading_question=q1&ai_session_id=session"), "paper_exam");
    expect(next?.get("grading_question")).toBe("q2");
    expect(next?.has("ai_grading_question")).toBe(false);
    expect(next?.get("ai_session_id")).toBe("session");
  });

  it("keeps a matrix bookmark on the existing overview matrix", () => {
    const next = resolveRetiredAdminQuery(new URLSearchParams("panel=grading&grading_view=matrix"), "paper_exam");
    expect(next?.get("panel")).toBe("overview");
    expect(next?.get("tab")).toBe("standings");
  });

  it.each(["panel=grading-workbench&workbench_mode=edit", "panel=settings", "panel=participants&user=s"])("leaves canonical links unchanged: %s", (query) => {
    expect(resolveRetiredAdminQuery(new URLSearchParams(query), "paper_exam")).toBeNull();
  });

  it("moves coding editor bookmarks into workbench edit while preserving coding selections", () => {
    const next = resolveRetiredAdminQuery(new URLSearchParams("panel=problem_editor&problem=p1"), "coding");
    expect(next?.get("panel")).toBe("grading-workbench");
    expect(next?.get("workbench_mode")).toBe("edit");
    expect(next?.get("problem")).toBe("p1");
  });
});
