import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { paperFixture } from "@/test/fixtures/examPaper";
import { buildEditRailRows } from "./editRailModel";
import { WorkbenchEditRail } from "./WorkbenchEditRail";
import type { TFunction } from "i18next";
const t = (key: string, fallback: string, values?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? ""));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? "")),
  }),
}));
const base = () => ({
  header: <h2>工作台</h2>,
  rows: buildEditRailRows(paperFixture(), [], t as TFunction),
  activeKey: "q1",
  locked: false,
  issueCount: 2,
  summary: { questions: 4, blocks: 3, totalScore: 20 },
  onSelect: vi.fn(),
  onMove: vi.fn(),
  onAdd: vi.fn(),
  onOpenPublishCheck: vi.fn(),
  legacyHref: "/?panel=problem_editor",
});
describe("edit rail", () => {
  it("drop onto lower half of group header moves into group", () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    fireEvent.dragStart(screen.getByRole("button", { name: "拖曳第 1 題" }), {
      dataTransfer: { setData: vi.fn(), effectAllowed: "" },
    });
    const row = screen
      .getByRole("button", { name: /^第 2 題（題組）/ })
      .closest("[data-row-key]")!;
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      top: 0,
      height: 100,
    } as DOMRect);
    for (const type of ["dragOver", "drop"] as const) {
      const event = createEvent[type](row, { bubbles: true });
      Object.defineProperty(event, "clientY", { value: 60 });
      fireEvent(row, event);
    }
    expect(props.onMove).toHaveBeenCalledWith("q1", {
      zone: "group",
      groupId: "g",
      refQuestionId: "c1",
      position: "before",
    });
  });
  it("active row move-down button calls onMove", () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "下移" }));
    expect(props.onMove).toHaveBeenCalledWith("q1", {
      zone: "top",
      refBlockId: "g",
      position: "after",
    });
  });
  it("locked rail offers no move controls", () => {
    render(<WorkbenchEditRail {...base()} locked />);
    expect(screen.queryByRole("button", { name: /拖曳/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "下移" })).toBeNull();
    expect(screen.queryByRole("button", { name: "新增題目" })).toBeNull();
  });
  it("publish check line shows count and opens drawer", () => {
    const props = base();
    const { rerender } = render(<WorkbenchEditRail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /發布前檢查.*2/ }));
    expect(props.onOpenPublishCheck).toHaveBeenCalled();
    rerender(<WorkbenchEditRail {...props} issueCount={0} />);
    expect(screen.queryByRole("button", { name: /發布前檢查/ })).toBeNull();
  });
});
