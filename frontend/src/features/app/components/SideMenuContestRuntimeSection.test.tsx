import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SideMenuContestRuntimeSection } from "./SideMenuContestRuntimeSection";

vi.mock("@/features/contest/contexts", () => ({
  useContestRuntimeNavigator: () => ({
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
  }),
}));

describe("SideMenuContestRuntimeSection", () => {
  it("shows only one return-to-contest action during a paper exam", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <MemoryRouter>
        <SideMenuContestRuntimeSection
          classroomId="classroom-1"
          contestId="contest-1"
          compact={false}
          problems={[]}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("返回競賽主頁")).toHaveLength(1);
  });
});
