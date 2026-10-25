import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { paperFixture } from "./workbenchEdit.fixture";
import { buildEditRailRows } from "./editRailModel";
import { WorkbenchEditRail } from "./WorkbenchEditRail";
import type { TFunction } from "i18next";

const motion = vi.hoisted(() => ({
  groups: new Map<string, (keys: string[]) => void>(),
  end: new Map<string, () => void>(),
  start: new Map<string, () => void>(),
}));
// jsdom cannot measure animated layout; drive the Motion boundary and verify
// the rail's visible preview and persistence. Real pointer drags are browser QA.
vi.mock("motion/react", () => ({
  Reorder: {
    Group: ({
      children,
      as: Tag = "div",
      className,
      onReorder,
      "aria-label": label,
    }: {
      children: ReactNode;
      as?: "div" | "nav";
      className?: string;
      onReorder(keys: string[]): void;
      "aria-label": string;
    }) => {
      motion.groups.set(label, onReorder);
      return (
        <Tag className={className} aria-label={label}>
          {children}
        </Tag>
      );
    },
    Item: ({
      children,
      value,
      onDragEnd,
      onDragStart,
    }: {
      children: ReactNode;
      value: string;
      onDragEnd(): void;
      onDragStart(): void;
    }) => {
      motion.end.set(value, onDragEnd);
      motion.start.set(value, onDragStart);
      return <div>{children}</div>;
    },
  },
  useDragControls: () => ({ start: vi.fn() }),
}));
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
  summary: { totalScore: 20 },
  onSelect: vi.fn(),
  onMove: vi.fn(),
  onAdd: vi.fn(),
  onOpenPublishCheck: vi.fn(),
});
const rowKeys = () =>
  [...document.querySelectorAll<HTMLElement>("[data-row-key]")].map(
    (node) => node.dataset.rowKey,
  );
const start = (key: string) => {
  const button = document.querySelector(`[data-row-key="${key}"] button`)!;
  fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
  act(() => motion.start.get(key)!());
};
beforeEach(() => {
  motion.groups.clear();
  motion.end.clear();
  motion.start.clear();
});
describe("edit rail", () => {
  it("shows the title and question type in each selectable entry", () => {
    render(<WorkbenchEditRail {...base()} />);
    const question = screen.getByRole("button", {
      name: /^Q1.*單選題.*Prompt q1/,
    });
    expect(within(question).getByText("Prompt q1")).toBeVisible();
    expect(question).toHaveAttribute("aria-current", "page");
    expect(within(question).getByRole("img", { name: "單選題" })).toBeVisible();
    expect(within(question).queryByText("單選題")).toBeNull();
    expect(within(question).queryByText("5")).toBeNull();
    expect(screen.queryByRole("button", { name: /拖曳/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Q2.*題組.*Shared task/ }),
    ).toBeVisible();
  });
  it("previews moving an entire group and saves only on release", async () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    start("q1");
    act(() => motion.groups.get("題目")!(["g", "q1", "q2"]));
    expect(rowKeys()).toEqual(["g", "c1", "c2", "q1", "q2"]);
    expect(props.onMove).not.toHaveBeenCalled();
    await act(async () => motion.end.get("q1")!());
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith("q1", {
      zone: "top",
      refBlockId: "g",
      position: "after",
    });
  });
  it("previews and saves children only inside their existing group", async () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    start("c2");
    act(() => motion.groups.get("Q2")!(["c2", "c1"]));
    expect(rowKeys()).toEqual(["q1", "g", "c2", "c1", "q2"]);
    expect(props.onMove).not.toHaveBeenCalled();
    await act(async () => motion.end.get("c2")!());
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith("c2", {
      zone: "group",
      groupId: "g",
      refQuestionId: "c1",
      position: "before",
    });
  });
  it("does not save a drag that returns to its original position", async () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    start("q1");
    act(() => motion.groups.get("題目")!(["g", "q1", "q2"]));
    act(() => motion.groups.get("題目")!(["q1", "g", "q2"]));
    await act(async () => motion.end.get("q1")!());
    expect(props.onMove).not.toHaveBeenCalled();
  });
  it("keeps the preview until saving finishes and restores server order on failure", async () => {
    const props = base();
    let reject!: (error: Error) => void;
    props.onMove.mockImplementation(
      () =>
        new Promise<void>((_, rejectSave) => {
          reject = rejectSave;
        }),
    );
    render(<WorkbenchEditRail {...props} />);
    start("q1");
    act(() => motion.groups.get("題目")!(["g", "q1", "q2"]));
    act(() => motion.end.get("q1")!());
    expect(rowKeys()).toEqual(["g", "c1", "c2", "q1", "q2"]);
    await act(async () => reject(new Error("Save failed")));
    await waitFor(() =>
      expect(rowKeys()).toEqual(["q1", "g", "c1", "c2", "q2"]),
    );
  });
  it("cancels the preview without saving when the pointer is cancelled", () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    start("q1");
    act(() => motion.groups.get("題目")!(["g", "q1", "q2"]));
    fireEvent.pointerCancel(document.querySelector(`[data-row-key="q1"]`)!);
    expect(rowKeys()).toEqual(["q1", "g", "c1", "c2", "q2"]);
    expect(props.onMove).not.toHaveBeenCalled();
  });
  it("does not select the dragged card on release but still selects on the next click", async () => {
    const props = base();
    render(<WorkbenchEditRail {...props} />);
    start("q1");
    act(() => motion.groups.get("題目")!(["g", "q1", "q2"]));
    await act(async () => motion.end.get("q1")!());
    const card = screen.getByRole("button", { name: /^Q1.*Prompt q1/ });
    fireEvent.click(card, { detail: 1 });
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(card, { button: 0, pointerId: 2 });
    fireEvent.click(card, { detail: 1 });
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith("q1");
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
  it("shows a publish warning that opens checks and disappears once resolved", () => {
    const props = base();
    const { rerender } = render(<WorkbenchEditRail {...props} />);
    const warning = screen.getByRole("region", { name: "發布前檢查" });
    expect(within(warning).getByText("發布前檢查 2 項")).toBeVisible();
    fireEvent.click(within(warning).getByRole("button", { name: "查看" }));
    expect(props.onOpenPublishCheck).toHaveBeenCalled();
    rerender(<WorkbenchEditRail {...props} issueCount={0} />);
    expect(screen.queryByRole("region", { name: "發布前檢查" })).toBeNull();
  });
  it("shows only the total without question counts, block counts or a legacy shortcut", () => {
    render(<WorkbenchEditRail {...base()} />);
    expect(screen.getByText("總分 20", { exact: true })).toBeVisible();
    expect(screen.queryByText(/4 題|3 區塊/)).toBeNull();
    expect(screen.queryByRole("link", { name: "改用舊版考卷管理" })).toBeNull();
  });
});
