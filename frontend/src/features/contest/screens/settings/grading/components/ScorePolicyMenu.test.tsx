import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OverflowMenuItem } from "@carbon/react";
import { describe, expect, it, vi } from "vitest";
import ScorePolicyMenu from "./ScorePolicyMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key) }),
}));

vi.mock("./ScorePolicyImpactDialog", () => ({ default: () => null }));
vi.mock("./RedistributeTargetModal", () => ({ default: () => null }));

describe("ScorePolicyMenu", () => {
  it("shows the caller's items in the same menu as the policies", () => {
    render(
      <MemoryRouter>
        <ScorePolicyMenu
          questionId="q1"
          questionIndex={1}
          currentPolicy="normal"
          impactContext={{ questions: [], studentIds: [], answersByStudent: new Map() }}
          menuLabel="更多操作"
          leadingItems={[<OverflowMenuItem key="rubric" itemText="AI 評分標準" />]}
          trailingItems={[<OverflowMenuItem key="revert" itemText="撤回此題 AI 分數" isDelete />]}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("button", { name: "更多操作" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByText("AI 評分標準")).toBeInTheDocument();
    expect(screen.getByText("設為不計分")).toBeInTheDocument();
    expect(screen.getByText("撤回此題 AI 分數")).toBeInTheDocument();
  });
});
