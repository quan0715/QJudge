import { describe, expect, it } from "vitest";
import { codingContestModule } from "./CodingModule";
import { paperExamContestModule } from "./PaperExamModule";

describe("admin panel visibility in draft", () => {
  it("opens coding editing through the workbench in draft", () => {
    const panels = codingContestModule.admin.getAvailablePanels({
      status: "draft",
    } as any);

    expect(panels).toEqual(["overview", "grading-workbench"]);
  });

  it("offers the workbench for paper exam drafts", () => {
    const panels = paperExamContestModule.admin.getAvailablePanels({
      status: "draft",
    } as any);

    expect(panels).toEqual(["overview", "grading-workbench"]);
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
    expect(codingPanels).toContain("participants");
    expect(codingPanels).not.toContain("logs");
    expect(codingPanels).not.toContain("statistics");
    expect(paperPanels).toContain("grading-workbench");
    expect(paperPanels).not.toContain("grading");
    expect(paperPanels).not.toContain("ai-grading");
    expect(paperPanels).toContain("participants");
    expect(paperPanels).not.toContain("logs");
    expect(paperPanels).not.toContain("statistics");
  });
});

describe("retired paper pages", () => {
  it("exposes one workbench and no duplicate editor or hidden grading pages", () => {
    expect(paperExamContestModule.admin.getAvailablePanels({ status: "published" } as any)).not.toContain("problem_editor");
    expect(paperExamContestModule.admin.getHiddenPanels?.({ status: "published" } as any) ?? []).toEqual([]);
  });
});
