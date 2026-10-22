import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BatchQuestionState } from "./batchGradingModel";
import { BatchGradingQuestionMenu } from "./BatchGradingQuestionMenu";

vi.mock("@/shared/ai/ArtifactPreview", () => ({
  ArtifactPreview: ({ artifact }: { artifact: { filename: string } }) => <p>{artifact.filename}</p>,
}));

const artifact = (filename: string) => ({
  artifact_id: filename,
  session_id: "s1",
  produced_by_run_id: null,
  step: "batch",
  filename,
  content_type: "text/plain",
  size_bytes: 1,
  checksum: "",
  metadata: {},
  created_at: "2026-10-23T00:00:00Z",
  updated_at: "2026-10-23T00:00:00Z",
});

const state = (overrides: Partial<BatchQuestionState>): BatchQuestionState => ({
  questionId: "q1",
  label: "Q1",
  index: 1,
  status: "completed",
  ungradedCount: 0,
  writtenCount: 3,
  runId: "r1",
  ...overrides,
});

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "grading.batch.menu" }));
}

// Carbon renders menu items in a floating body that jsdom does not expose as menuitems.
const menuItem = (name: string) => screen.getByText(name).closest("button") as HTMLButtonElement;

describe("BatchGradingQuestionMenu", () => {
  it("disables revert while question is running", () => {
    render(
      <BatchGradingQuestionMenu state={state({ status: "running" })} onRevert={vi.fn()} onRegrade={vi.fn()} />,
    );

    openMenu();
    expect(menuItem("grading.batch.revert")).toBeDisabled();
    expect(menuItem("grading.batch.regrade")).toBeDisabled();
  });

  it("confirms before reverting", async () => {
    const onRevert = vi.fn().mockResolvedValue(["a1"]);
    render(<BatchGradingQuestionMenu state={state({})} onRevert={onRevert} onRegrade={vi.fn()} />);

    openMenu();
    fireEvent.click(menuItem("grading.batch.revert"));
    expect(onRevert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /grading.batch.revertConfirm/ }));

    await waitFor(() => expect(onRevert).toHaveBeenCalledWith("q1"));
  });

  it("keeps the dialog open and shows the error when revert fails", async () => {
    const onRevert = vi.fn().mockRejectedValue(new Error("撤回失敗：網路錯誤"));
    render(<BatchGradingQuestionMenu state={state({})} onRevert={onRevert} onRegrade={vi.fn()} />);

    openMenu();
    fireEvent.click(menuItem("grading.batch.revert"));
    fireEvent.click(screen.getByRole("button", { name: /grading.batch.revertConfirm/ }));

    expect(await screen.findByText("撤回失敗：網路錯誤")).toBeInTheDocument();
  });

  it("sends the regrade note", async () => {
    const onRegrade = vi.fn().mockResolvedValue(undefined);
    render(<BatchGradingQuestionMenu state={state({})} onRevert={vi.fn()} onRegrade={onRegrade} />);

    openMenu();
    fireEvent.click(menuItem("grading.batch.regrade"));
    fireEvent.change(screen.getByLabelText("grading.batch.regradeNote"), {
      target: { value: "英文不扣分" },
    });
    fireEvent.click(screen.getByRole("button", { name: "grading.batch.regradeConfirm" }));

    await waitFor(() => expect(onRegrade).toHaveBeenCalledWith("q1", "英文不扣分"));
  });

  it("renders nothing for questions the batch never ran", () => {
    const { container } = render(
      <BatchGradingQuestionMenu state={state({ status: "idle", runId: undefined })} onRevert={vi.fn()} onRegrade={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the question's rubric and AI grades read-only", async () => {
    const onLoadFiles = vi.fn().mockResolvedValue({
      rubric: artifact("rubric_q1.md"),
      grade: artifact("grade_q1.csv"),
    });
    render(
      <BatchGradingQuestionMenu
        state={state({})}
        onRevert={vi.fn()}
        onRegrade={vi.fn()}
        onLoadFiles={onLoadFiles}
      />,
    );

    openMenu();
    fireEvent.click(menuItem("grading.batch.files"));

    expect(await screen.findByText("rubric_q1.md")).toBeInTheDocument();
    expect(onLoadFiles).toHaveBeenCalledWith("q1");
    fireEvent.click(screen.getByRole("tab", { name: "grading.batch.filesGrades" }));
    expect(await screen.findByText("grade_q1.csv")).toBeInTheDocument();
  });

  it("warns that skipped answers were not graded with this rubric", async () => {
    const onLoadFiles = vi.fn().mockResolvedValue({ rubric: null, grade: null });
    render(
      <BatchGradingQuestionMenu
        state={state({ skippedAtWriteCount: 4 })}
        onRevert={vi.fn()}
        onRegrade={vi.fn()}
        onLoadFiles={onLoadFiles}
      />,
    );

    openMenu();
    fireEvent.click(menuItem("grading.batch.files"));

    expect(await screen.findByText("grading.batch.filesNotUsed")).toBeInTheDocument();
    expect(screen.getAllByText("grading.batch.filesMissing").length).toBeGreaterThan(0);
  });
});
