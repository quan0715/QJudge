import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkbenchQuestionRail } from "./WorkbenchQuestionRail";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
  }),
}));

const units = [
  { id: "u1", label: "1.", title: "Boolean operations", questionType: "single_choice" as const, progress: "16/16" },
  { id: "u3", label: "3.", title: "Notation conversion", progress: "14/16", aiStatus: "running" as const },
  { id: "u6", label: "6.", title: "Array traversal", progress: "13/16", aiStatus: "failed" as const },
];

const base = {
  units,
  activeId: "u1",
  disabled: false,
  onSelect: vi.fn(),
  onStartExam: vi.fn(),
  onStopExam: vi.fn(),
};

describe("WorkbenchQuestionRail", () => {
  it("rail shows status instead of progress", () => {
    render(<WorkbenchQuestionRail {...base} examAi={{ state: "idle", progressText: "", canStart: true }} />);
    expect(screen.getByRole("heading", { name: "工作台" })).toBeTruthy();
    expect(screen.getByText("16/16")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "3.草稿完成進度" })).toBeTruthy();
    expect(screen.getByLabelText("AI 失敗")).toBeTruthy();
    expect(screen.queryByText("14/16")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /6\. Array traversal/ }));
    expect(base.onSelect).toHaveBeenCalledWith("u6");
    fireEvent.click(screen.getByRole("button", { name: "AI 批改整份考卷" }));
    expect(base.onStartExam).toHaveBeenCalled();
  });

  it("shows question titles and preserves disabled navigation", () => {
    render(<WorkbenchQuestionRail {...base} disabled examAi={{ state: "idle", progressText: "", canStart: true }} />);
    const question = screen.getByRole("button", { name: /1\. Boolean operations/ });
    expect(question).toBeDisabled();
    expect(question).toHaveAttribute("aria-current", "page");
    expect(screen.getByTitle("Notation conversion")).toBeInTheDocument();
  });

  it("rail running state shows stop", () => {
    const onStopExam = vi.fn();
    render(
      <WorkbenchQuestionRail
        {...base}
        onStopExam={onStopExam}
        examAi={{ state: "running", progressText: "1/5 題", canStart: false, completedUnits: 1, totalUnits: 5 }}
      />,
    );
    expect(screen.queryByRole("button", { name: "AI 批改整份考卷" })).toBeNull();
    expect(screen.getByText((_, node) => node?.tagName === "SPAN" && node.textContent === "AI 批改中　1/5 題")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "已完成寫分" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar", { name: "已完成寫分" })).toHaveAttribute("aria-valuemax", "5");
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(onStopExam).toHaveBeenCalled();
  });

  it("retains confirmed submission progress after the run finishes", () => {
    const { rerender } = render(<WorkbenchQuestionRail {...base} examAi={{ state: "running", progressText: "0/1 題", canStart: false, completedUnits: 0, totalUnits: 1 }} />);
    expect(screen.getByRole("progressbar", { name: "已完成寫分" })).toHaveAttribute("aria-valuenow", "0");
    rerender(<WorkbenchQuestionRail {...base} examAi={{ state: "idle", progressText: "1/1 題", canStart: true, completedUnits: 1, totalUnits: 1 }} />);
    expect(screen.getByRole("progressbar", { name: "已完成寫分" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("1/1 題")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "已完成寫分" })).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停止" })).not.toBeInTheDocument();
  });

  it("running rail shows the AI's todos and how many answers it has scored", () => {
    render(
      <WorkbenchQuestionRail
        {...base}
        units={[{ id: "u3", label: "3.", title: "Notation conversion", progress: "14/16", aiStatus: "running", aiProgress: "3/16" }]}
        activeId="u3"
        examAi={{
          state: "running",
          progressText: "0/1 題",
          canStart: false,
          todos: [{ id: "t1", label: "制定第 3 題規準", status: "in_progress" }],
        }}
      />,
    );
    expect(screen.getByText("制定第 3 題規準")).toBeTruthy();
    expect(screen.getByRole("button", { name: /3\. Notation conversion/ })).not.toHaveTextContent("AI 批改中");
    expect(screen.getByRole("progressbar", { name: "3.草稿完成進度" })).toHaveAttribute("title", "AI 批改中 · 已寫入 3/16");
  });
});
