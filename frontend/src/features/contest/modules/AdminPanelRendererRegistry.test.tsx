import { describe, expect, it, vi } from "vitest";
import type { AdminPanelRenderer, ContestTypeModule } from "./types";
import { getAdminPanelRenderer } from "./AdminPanelRendererRegistry";

const createModule = (
  renderer?: AdminPanelRenderer,
): ContestTypeModule => ({
  type: "coding",
  student: {
    getTabs: () => [],
    getSolveRenderer: () => () => null,
    getAnsweringEntryPath: () => "/dashboard",
  },
  admin: {
    editorKind: "coding",
    getAvailablePanels: () => ["overview"],
    getPanelRenderers: renderer
      ? () => ({ overview: renderer })
      : undefined,
    getExportTargets: () => [],
  },
});

describe("admin panel renderer registry", () => {
  it.each(["overview", "clarifications", "proctoring", "grading", "ai-grading"] as const)(
    "keeps the default %s panel behind a lazy boundary",
    (panelId) => {
      const renderer = getAdminPanelRenderer(panelId, createModule());

      expect(renderer).toHaveProperty("$$typeof", Symbol.for("react.lazy"));
    },
  );

  it("prefers a module-specific renderer", () => {
    const customRenderer = vi.fn(() => null);

    expect(getAdminPanelRenderer("overview", createModule(customRenderer))).toBe(
      customRenderer,
    );
  });
});
