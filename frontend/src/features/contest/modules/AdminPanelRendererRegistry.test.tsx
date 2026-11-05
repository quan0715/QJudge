import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ContestTypeModule } from "./types";
import { getAdminPanelRenderer } from "./AdminPanelRendererRegistry";

vi.mock("../screens/settings/ContestWorkbenchScreen", () => ({
  default: () => <div>工作台</div>,
}));

const contestModule = {
  admin: {
    getPanelRenderers: () => ({}),
  },
} as unknown as ContestTypeModule;

describe("AdminPanelRendererRegistry", () => {
  it.each(["grading", "ai-grading", "grading-workbench"] as const)("renders %s with the current workbench", async (panel) => {
    const GradingPanel = getAdminPanelRenderer(panel, contestModule);

    render(
      <Suspense fallback={<div>外層 panel loading</div>}>
        <GradingPanel contestId="contest-1" />
      </Suspense>,
    );

    expect(await screen.findByText("工作台")).toBeInTheDocument();
    expect(screen.queryByText("外層 panel loading")).not.toBeInTheDocument();
  });
});
