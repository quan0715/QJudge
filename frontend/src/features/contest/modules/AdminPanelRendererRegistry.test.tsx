import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ContestTypeModule } from "./types";
import { getAdminPanelRenderer } from "./AdminPanelRendererRegistry";

vi.mock("../screens/settings/ContestExamGradingScreen", () => ({
  default: () => <div>批改畫面已接管載入狀態</div>,
}));

const contestModule = {
  admin: {
    getPanelRenderers: () => ({}),
  },
} as unknown as ContestTypeModule;

describe("AdminPanelRendererRegistry", () => {
  it("renders the grading panel synchronously so it owns the only loading state", () => {
    const GradingPanel = getAdminPanelRenderer("grading", contestModule);

    render(
      <Suspense fallback={<div>外層 panel loading</div>}>
        <GradingPanel contestId="contest-1" />
      </Suspense>,
    );

    expect(screen.getByText("批改畫面已接管載入狀態")).toBeInTheDocument();
    expect(screen.queryByText("外層 panel loading")).not.toBeInTheDocument();
  });
});
