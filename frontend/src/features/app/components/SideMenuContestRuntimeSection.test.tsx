import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SideMenuContestRuntimeSection } from "./SideMenuContestRuntimeSection";

const runtime = vi.hoisted(() => ({ navigator: null as unknown }));
vi.mock("@/features/contest/contexts", () => ({
  useContestRuntimeNavigator: () => runtime.navigator,
}));

const codingNavigator = (overrides: Record<string, unknown>) => ({
  coding: true,
  items: ["A", "B", "C", "D"].map((label, index) => ({
    kind: "coding",
    data: { id: `cp${index}`, problemId: `p${index}`, label, title: `Problem ${label}` },
  })),
  activeIndex: 0,
  answeredIds: new Set<string>(),
  onSelect: vi.fn(),
  ...overrides,
});

const renderSection = () =>
  render(
    <MemoryRouter>
      <SideMenuContestRuntimeSection classroomId="classroom-1" contestId="contest-1" compact={false} problems={[]} />
    </MemoryRouter>,
  );
const statusOf = (label: string) =>
  within(screen.getByRole("button", { name: new RegExp(`${label}\\s*Problem ${label}`) })).getByRole("img").getAttribute("aria-label");

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SideMenuContestRuntimeSection", () => {
  it("leaves the return-to-contest action to the top navigation", () => {
    runtime.navigator = {
      coding: false,
      items: [{
        kind: "question",
        data: { id: "question-1", questionType: "short_answer", prompt: "Question" },
      }],
      activeIndex: 0,
      answeredIds: new Set<string>(),
      markedIds: new Set<string>(),
      overviewLabel: "返回競賽主頁",
      onSelectOverview: vi.fn(),
      onSelect: vi.fn(),
    };
    renderSection();

    expect(screen.queryByRole("button", { name: "返回競賽主頁" })).not.toBeInTheDocument();
    expect(screen.getByText("Question")).toBeInTheDocument();
  });

  it("shows judging, passed, failed and untouched per problem", () => {
    runtime.navigator = codingNavigator({
      answeredIds: new Set(["cp1"]),
      judgeStatuses: { p0: "judging", p2: "rejected" },
    });
    renderSection();

    expect(statusOf("A")).toBe("判題中");
    expect(statusOf("B")).toBe("通過");
    expect(statusOf("C")).toBe("未通過");
    expect(statusOf("D")).toBe("未作答");
  });

  it("keeps a problem passed when a later submission is rejected", () => {
    const navigator = codingNavigator({ judgeStatuses: { p0: "rejected" } });
    (navigator.items[0].data as Record<string, unknown>).userStatus = "AC";
    runtime.navigator = navigator;
    renderSection();

    expect(statusOf("A")).toBe("通過");
  });

  it("shows judging over an earlier pass", () => {
    runtime.navigator = codingNavigator({ answeredIds: new Set(["cp0"]), judgeStatuses: { p0: "judging" } });
    renderSection();

    expect(statusOf("A")).toBe("判題中");
  });
});
