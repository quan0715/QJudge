import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { paperFixture } from "./workbenchEdit.fixture";
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
function startDrag(name: string) {
  fireEvent.dragStart(screen.getByRole("button", { name }), {
    dataTransfer: { setData: vi.fn(), effectAllowed: "" },
  });
}
function rowOf(name: RegExp) {
  const row = screen
    .getByRole("button", { name })
    .closest("[data-row-key]") as HTMLElement;
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
    top: 0,
    height: 100,
  } as DOMRect);
  return row;
}
function fireAt(row: HTMLElement, type: "dragOver" | "drop", y: number) {
  const event = createEvent[type](row, { bubbles: true });
  Object.defineProperty(event, "clientY", { value: y });
  fireEvent(row, event);
}
const dragOver = (row: HTMLElement, y: number) => fireAt(row, "dragOver", y);
const drop = (row: HTMLElement, y: number) => fireAt(row, "drop", y);
function dragOverAndDrop(row: HTMLElement, y: number) {
  dragOver(row, y);
  drop(row, y);
}
describe("edit rail", () => {
  it("drop onto a group header orders before the group", () => {
    const props = base();
    render(<WorkbenchEditRail {...props} activeKey="q2" />);
    startDrag("拖曳第 3 題");
    const row = rowOf(/^第 2 題（題組）/);
    dragOverAndDrop(row, 60);
    expect(props.onMove).toHaveBeenCalledWith("q2", {
      zone: "top",
      refBlockId: "g",
      position: "before",
    });
  });
  it("drop below the last child orders after the whole group", () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    startDrag("拖曳第 1 題");
    const row = rowOf(/^2\(b\)/);
    dragOver(row, 60);
    expect(row.className).toMatch(/dropAfter/);
    drop(row, 60);
    expect(props.onMove).toHaveBeenCalledWith("q1", {
      zone: "top",
      refBlockId: "g",
      position: "after",
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
