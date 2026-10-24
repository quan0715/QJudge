import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkbenchQuestionRail } from "./WorkbenchQuestionRail";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
  }),
}));

const units = [
  { id: "u1", label: "第 1 題", progress: "16/16" },
  { id: "u3", label: "第 3 題", progress: "14/16", aiStatus: "running" as const },
  { id: "u6", label: "第 6 題", progress: "13/16", aiStatus: "failed" as const },
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
    expect(screen.getByText("16/16")).toBeTruthy();
    expect(screen.getByText("AI 批改中")).toBeTruthy();
    expect(screen.getByText("AI 失敗")).toBeTruthy();
    expect(screen.queryByText("14/16")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /第 6 題/ }));
    expect(base.onSelect).toHaveBeenCalledWith("u6");
    fireEvent.click(screen.getByRole("button", { name: "AI 批改整份考卷" }));
    expect(base.onStartExam).toHaveBeenCalled();
  });

  it("rail running state shows stop", () => {
    const onStopExam = vi.fn();
    render(
      <WorkbenchQuestionRail
        {...base}
        onStopExam={onStopExam}
        examAi={{ state: "running", progressText: "1/5 題", canStart: false }}
      />,
    );
    expect(screen.queryByRole("button", { name: "AI 批改整份考卷" })).toBeNull();
    expect(screen.getByText((_, node) => node?.tagName === "SPAN" && node.textContent === "AI 批改中　1/5 題")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(onStopExam).toHaveBeenCalled();
  });

  it("running rail shows the AI's todos and how many answers it has scored", () => {
    render(
      <WorkbenchQuestionRail
        {...base}
        units={[{ id: "u3", label: "第 3 題", progress: "14/16", aiStatus: "running", aiProgress: "3/16" }]}
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
    expect(screen.getByRole("button", { name: /第 3 題/ })).toHaveTextContent("AI 批改中 3/16");
  });
});
