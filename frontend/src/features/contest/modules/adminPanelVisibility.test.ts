import { describe, expect, it } from "vitest";
import { codingContestModule } from "./CodingModule";
import { paperExamContestModule } from "./PaperExamModule";

describe("admin panel visibility in draft", () => {
  it("limits coding contest panels to overview/problem_editor in draft", () => {
    const panels = codingContestModule.admin.getAvailablePanels({
      status: "draft",
    } as any);

    expect(panels).toEqual(["overview", "problem_editor"]);
  });

  it("limits paper exam panels to overview/problem_editor in draft", () => {
    const panels = paperExamContestModule.admin.getAvailablePanels({
      status: "draft",
    } as any);

    expect(panels).toEqual(["overview", "problem_editor"]);
  });

  it("keeps grading-related panels after publish", () => {
    const codingPanels = codingContestModule.admin.getAvailablePanels({
      status: "published",
    } as any);
    const paperPanels = paperExamContestModule.admin.getAvailablePanels({
      status: "published",
    } as any);

    expect(codingPanels).not.toContain("clarifications");
    expect(paperPanels).not.toContain("clarifications");
    expect(codingPanels).not.toContain("standings");
    expect(codingPanels).not.toContain("grading");
    expect(codingPanels).not.toContain("ai-grading");
    expect(codingPanels).toContain("proctoring");
    expect(codingPanels).not.toContain("participants");
    expect(codingPanels).not.toContain("logs");
    expect(codingPanels).not.toContain("statistics");
    expect(paperPanels).toContain("grading-workbench");
    expect(paperPanels).not.toContain("grading");
    expect(paperPanels).not.toContain("ai-grading");
    expect(paperPanels).toContain("proctoring");
    expect(paperPanels).not.toContain("participants");
    expect(paperPanels).not.toContain("logs");
    expect(paperPanels).not.toContain("statistics");
  });
});

describe("legacy grading panels", () => {
  it("hidden panels stay routable for paper exams", () => {
    expect(paperExamContestModule.admin.getHiddenPanels?.({ status: "published" } as any)).toEqual([
      "grading",
      "ai-grading",
    ]);
  });
});
