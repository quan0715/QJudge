import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BatchQuestionState } from "./batchGradingModel";
import { BatchGradingQuestionNotice } from "./BatchGradingQuestionNotice";

const state = (overrides: Partial<BatchQuestionState>): BatchQuestionState => ({
  questionId: "q1",
  label: "Q1",
  index: 1,
  status: "running",
  ungradedCount: 3,
  writtenCount: 0,
  ...overrides,
});

describe("BatchGradingQuestionNotice", () => {
  it("renders running notice", () => {
    render(<BatchGradingQuestionNotice state={state({})} onResume={vi.fn()} />);
    expect(screen.getByText("grading.batch.noticeRunning")).toBeInTheDocument();
  });

  it("renders failed notice with error and a fill action", () => {
    const onResume = vi.fn();
    render(
      <BatchGradingQuestionNotice
        state={state({ status: "failed", error: "模型逾時", ungradedCount: 18 })}
        onResume={onResume}
      />,
    );

    expect(screen.getByText("grading.batch.noticeFailed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "grading.batch.fill" }));
    expect(onResume).toHaveBeenCalled();
  });

  it("renders approval notice", () => {
    render(
      <BatchGradingQuestionNotice state={state({ status: "awaiting-approval" })} onResume={vi.fn()} />,
    );
    expect(screen.getByText("grading.batch.noticeAwaitingApproval")).toBeInTheDocument();
  });

  it("renders nothing for a fully written question", () => {
    const { container } = render(
      <BatchGradingQuestionNotice state={state({ status: "completed", ungradedCount: 0 })} onResume={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("warns when a completed run left answers unwritten", () => {
    const onResume = vi.fn();
    render(
      <BatchGradingQuestionNotice
        state={state({ status: "completed", ungradedCount: 2, error: "1 份寫入失敗" })}
        onResume={onResume}
      />,
    );

    expect(screen.getByText("grading.batch.noticeIncomplete")).toBeInTheDocument();
    expect(screen.getByText("1 份寫入失敗")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "grading.batch.fill" }));
    expect(onResume).toHaveBeenCalled();
  });

  it("says the batch stopped for a stopped question, not that it completed", () => {
    render(
      <BatchGradingQuestionNotice
        state={state({ status: "cancelled", ungradedCount: 2 })}
        onResume={vi.fn()}
      />,
    );

    expect(screen.getByText("grading.batch.noticeStopped")).toBeInTheDocument();
    expect(screen.queryByText("grading.batch.noticeIncomplete")).not.toBeInTheDocument();
  });

  it("without a resume action, a failure shows its reason and no fill button", () => {
    render(<BatchGradingQuestionNotice state={state({ status: "failed", error: "模型逾時", ungradedCount: 4 })} />);
    expect(screen.getByText("grading.batch.noticeFailed")).toBeInTheDocument();
    expect(screen.getByText("模型逾時")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("without a resume action, a stopped run leaves no reminder", () => {
    const { container } = render(<BatchGradingQuestionNotice state={state({ status: "cancelled", ungradedCount: 11 })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
