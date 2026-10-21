import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UseBatchGradingResult } from "./useBatchGrading";
import type { BatchQuestionState } from "./batchGradingModel";
import { BatchGradingToolbarControl } from "./BatchGradingToolbarControl";

const state = (overrides: Partial<BatchQuestionState>): BatchQuestionState => ({
  questionId: "q1",
  label: "Q1",
  index: 1,
  status: "idle",
  ungradedCount: 3,
  writtenCount: 0,
  ...overrides,
});

const batch = (overrides: Partial<UseBatchGradingResult> = {}): UseBatchGradingResult => ({
  sessionId: null,
  questions: [state({})],
  overall: { total: 1, done: 0, writtenCount: 0, ungradedTotal: 3, running: false },
  canStart: true,
  busy: false,
  start: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  revertQuestion: vi.fn(),
  regradeQuestion: vi.fn(),
  ...overrides,
});

describe("BatchGradingToolbarControl", () => {
  it("shows start button disabled with reason when results are published", () => {
    render(
      <BatchGradingToolbarControl
        batch={batch({ canStart: false })}
        resultsPublished
        onRequestStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /grading.batch.start/ })).toBeDisabled();
    expect(screen.getByText("grading.batch.publishedDisabled")).toBeInTheDocument();
  });

  it("opens the start dialog from the start button", () => {
    const onRequestStart = vi.fn();
    render(
      <BatchGradingToolbarControl batch={batch()} resultsPublished={false} onRequestStart={onRequestStart} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /grading.batch.start/ }));
    expect(onRequestStart).toHaveBeenCalled();
  });

  it("shows progress tag and stop while running", () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    render(
      <BatchGradingToolbarControl
        batch={batch({
          sessionId: "s1",
          stop,
          questions: [state({ status: "running" }), state({ questionId: "q2", status: "completed" })],
          overall: { total: 2, done: 1, writtenCount: 4, ungradedTotal: 3, running: true },
        })}
        resultsPublished={false}
        onRequestStart={vi.fn()}
      />,
    );

    expect(screen.getByText("grading.batch.progress")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /grading.batch.stop/ }));
    expect(stop).toHaveBeenCalled();
  });

  it("shows fill button with remaining count after failure", () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    render(
      <BatchGradingToolbarControl
        batch={batch({
          sessionId: "s1",
          resume,
          questions: [state({ status: "failed", ungradedCount: 18 })],
          overall: { total: 1, done: 0, writtenCount: 18, ungradedTotal: 18, running: false },
        })}
        resultsPublished={false}
        onRequestStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "grading.batch.fill" }));
    expect(resume).toHaveBeenCalled();
  });

  it("offers to fill when a completed question still has ungraded answers", () => {
    render(
      <BatchGradingToolbarControl
        batch={batch({
          sessionId: "s1",
          questions: [state({ status: "completed", ungradedCount: 2 })],
          overall: { total: 1, done: 1, writtenCount: 3, ungradedTotal: 2, running: false },
        })}
        resultsPublished={false}
        onRequestStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "grading.batch.fill" })).toBeEnabled();
    expect(screen.queryByText("grading.batch.allWritten")).not.toBeInTheDocument();
  });

  it("disables actions while a batch action is in flight", () => {
    render(
      <BatchGradingToolbarControl
        batch={batch({
          sessionId: "s1",
          busy: true,
          questions: [state({ status: "failed", ungradedCount: 2 })],
          overall: { total: 1, done: 0, writtenCount: 0, ungradedTotal: 2, running: false },
        })}
        resultsPublished={false}
        onRequestStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "grading.batch.fill" })).toBeDisabled();
  });

  it("shows the latest batch error", () => {
    render(
      <BatchGradingToolbarControl
        batch={batch({ sessionId: "s1", error: "網路錯誤" })}
        resultsPublished={false}
        onRequestStart={vi.fn()}
      />,
    );

    expect(screen.getByText("網路錯誤")).toBeInTheDocument();
  });

  it("shows all written when every question finished", () => {
    render(
      <BatchGradingToolbarControl
        batch={batch({
          sessionId: "s1",
          questions: [state({ status: "completed", ungradedCount: 0 })],
          overall: { total: 1, done: 1, writtenCount: 3, ungradedTotal: 0, running: false },
        })}
        resultsPublished={false}
        onRequestStart={vi.fn()}
      />,
    );

    expect(screen.getByText("grading.batch.allWritten")).toBeInTheDocument();
  });
});
