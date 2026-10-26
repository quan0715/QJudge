import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaperBlock } from "@/core/entities/contest.entity";
import { paperFixture } from "./workbenchEdit.fixture";
import type { WorkbenchEditActions } from "./WorkbenchEditScreen";
import { WorkbenchGroupEditor } from "./WorkbenchGroupEditor";
vi.mock("./WorkbenchMarkdownField", () => ({
  default: ({
    value,
    onChange,
    labelText,
  }: {
    value: string;
    onChange(v: string): void;
    labelText: string;
  }) => (
    <textarea
      aria-label={labelText}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? "")),
  }),
}));
const base = () => ({
  block: paperFixture().blocks[1] as Extract<ExamPaperBlock, { kind: "group" }>,
  label: "第 2 題（題組）",
  childLabels: new Map([
    ["c1", "2(a)"],
    ["c2", "2(b)"],
  ]),
  locked: false,
  expandedChildId: null,
  onExpandChild: vi.fn(),
  saveStatus: "idle" as const,
  actions: {
    saveGroup: vi.fn().mockResolvedValue(undefined),
    addChild: vi.fn().mockResolvedValue(undefined),
    saveQuestion: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    saveToBank: vi.fn(),
    confirmDiscard: vi.fn().mockResolvedValue(true),
  } satisfies WorkbenchEditActions,
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 240,
    height: 40,
    top: 0,
    bottom: 40,
    left: 0,
    right: 240,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("group editor", () => {
  it("jumps to a child and expands it from the group navigation", async () => {
    const props = base();
    function View() {
      const [expanded, setExpanded] = useState<string | null>(null);
      return (
        <WorkbenchGroupEditor
          {...props}
          expandedChildId={expanded}
          onExpandChild={setExpanded}
        />
      );
    }
    render(<View />);
    fireEvent.click(screen.getByRole("button", { name: "編輯 2(b)" }));
    expect(await screen.findByRole("textbox", { name: "題目敘述" })).toHaveValue(
      "Prompt c2",
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
  it("autosaves the changed group title after 1000ms", async () => {
    vi.useFakeTimers();
    const props = base();
    render(<WorkbenchGroupEditor {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: "題組標題" }), {
      target: { value: "新標題" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(props.actions.saveGroup).toHaveBeenCalledWith("g", {
      title: "新標題",
    });
  });
  it("expands a child editor", async () => {
    const props = base();
    function View() {
      const [expanded, setExpanded] = useState<string | null>(null);
      return (
        <WorkbenchGroupEditor
          {...props}
          expandedChildId={expanded}
          onExpandChild={setExpanded}
        />
      );
    }
    render(<View />);
    fireEvent.click(screen.getByRole("button", { name: /2\(a\).*Prompt c1/ }));
    expect(
      await screen.findByRole("textbox", { name: "題目敘述" }),
    ).toHaveValue("Prompt c1");
  });
  it("keeps an invalid child draft expanded on collapse or child switch", async () => {
    const props = base();
    function View() {
      const [expanded, setExpanded] = useState<string | null>("c1");
      return (
        <WorkbenchGroupEditor
          {...props}
          expandedChildId={expanded}
          onExpandChild={setExpanded}
        />
      );
    }
    render(<View />);
    fireEvent.change(screen.getByRole("textbox", { name: "題目敘述" }), {
      target: { value: "Keep this child draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增選項" }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /2\(a\).*Prompt c1/ }),
      );
    });
    expect(screen.getByRole("textbox", { name: "題目敘述" })).toHaveValue(
      "Keep this child draft",
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /2\(b\).*Prompt c2/ }),
      );
    });
    expect(screen.getByRole("textbox", { name: "題目敘述" })).toHaveValue(
      "Keep this child draft",
    );
    expect(props.actions.saveQuestion).not.toHaveBeenCalled();
  });
  it("adds the chosen subquestion type", async () => {
    const props = base();
    render(<WorkbenchGroupEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "新增子題" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "簡答題" }));
    expect(props.actions.addChild).toHaveBeenCalledWith("g", "short_answer");
  });
  it("keeps an empty group visible", () => {
    const props = base();
    render(
      <WorkbenchGroupEditor
        {...props}
        block={{ ...props.block, children: [] }}
      />,
    );
    expect(screen.getByText("尚無子題")).toBeTruthy();
  });
});
