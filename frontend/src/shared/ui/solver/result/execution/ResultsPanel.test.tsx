import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionState, TestCaseResult } from "@/core/types/solver.types";
import { ResultPanel } from "../ResultPanel";
import { ResultsPanel } from "./ResultsPanel";

const START = Date.parse("2026-10-18T10:00:00Z");
const cases = (count: number, failedIndex = -1, prefix = "c"): TestCaseResult[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index}`,
    passed: index !== failedIndex,
    status: index === failedIndex ? "WA" : "AC",
    input: `${index}`,
    expectedOutput: `${index}`,
    actualOutput: index === failedIndex ? "x" : `${index}`,
    executionTime: 3,
  }));
const submission = (status: string, passed: number, total: number, score: number, list: TestCaseResult[]): ExecutionState => ({
  type: "submit", status: "complete", startedAt: START,
  result: { type: "submit", status, passed, total, score, cases: list },
});
const caseButton = (label: string) => screen.getByRole("button", { name: new RegExp(`${label}(\\s|$)`) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START + 3000);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.useRealTimers(); });

describe("ResultsPanel", () => {
  it("shows queued then judging with the waiting seconds instead of skeletons", () => {
    const judging = (queued: boolean): ExecutionState => ({
      type: "submit", status: "polling", queued, startedAt: START,
      result: { type: "submit", status: "Pending", passed: 0, total: 0, cases: [] },
    });
    const { container, rerender } = render(<ResultsPanel executionState={judging(true)} testCases={[]} />);
    expect(screen.getByText("排隊中")).toBeInTheDocument();
    expect(screen.getByText("已等待 3 秒")).toBeInTheDocument();
    expect(screen.getByText("這筆提交正在排隊")).toBeInTheDocument();
    expect(screen.getByText("可以先切到其他題，判完會通知你。")).toBeInTheDocument();
    expect(container.querySelector('[class*="skeleton"]')).toBeNull();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("已等待 5 秒")).toBeInTheDocument();
    rerender(<ResultsPanel executionState={judging(false)} testCases={[]} />);
    expect(screen.getByText("判題中")).toBeInTheDocument();
    expect(screen.getByText("這筆提交正在判題")).toBeInTheDocument();
  });

  it("summarises passed cases and score", () => {
    const { rerender } = render(<ResultsPanel executionState={submission("WA", 98, 104, 60, cases(3, 1))} testCases={[]} />);
    expect(screen.getByText("通過 98 / 104 · 分數 60")).toBeInTheDocument();

    rerender(<ResultsPanel
      executionState={{ type: "test", status: "complete", result: { type: "run", passed: 2, failed: 1, total: 3, cases: cases(3, 2) } }}
      testCases={[]}
    />);
    expect(screen.getByText("通過 2 / 3")).toBeInTheDocument();
    expect(screen.queryByText(/分數/)).not.toBeInTheDocument();
  });

  it("selects the first failed case", () => {
    render(<ResultsPanel executionState={submission("WA", 7, 8, 80, cases(8, 6))} testCases={[]} />);
    expect(caseButton("#7")).toHaveAttribute("aria-pressed", "true");
    expect(caseButton("#1")).toHaveAttribute("aria-pressed", "false");
  });

  it("collapses an accepted submission's cases until expanded", () => {
    render(<ResultsPanel executionState={submission("AC", 104, 104, 100, cases(104))} testCases={[]} />);
    expect(screen.getByText("104 筆測資全部通過。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /#1(\s|$)/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展開清單" }));
    expect(caseButton("#1")).toBeInTheDocument();
  });

  it("keeps a fully passing test run expanded", () => {
    render(<ResultsPanel
      executionState={{ type: "test", status: "complete", result: { type: "run", passed: 2, failed: 0, total: 2, cases: cases(2) } }}
      testCases={[]}
    />);
    expect(caseButton("#1")).toBeInTheDocument();
  });
});

describe("ResultPanel", () => {
  it("selects the first failure again when another run is shown", () => {
    const props = {
      mode: "results" as const, onModeChange: vi.fn(), testCases: [], selectedCaseId: null,
      onSelectCase: vi.fn(), onAddTestCase: vi.fn(), onDeleteTestCase: vi.fn(),
    };
    const { rerender } = render(<ResultPanel {...props} executionState={submission("WA", 1, 2, 50, cases(2, 1, "a"))} />);
    expect(caseButton("#2")).toHaveAttribute("aria-pressed", "true");
    rerender(<ResultPanel {...props} executionState={{ ...submission("WA", 1, 2, 50, cases(2, 0, "b")), startedAt: START + 1 }} />);
    expect(caseButton("#1")).toHaveAttribute("aria-pressed", "true");
  });
});
