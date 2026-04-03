import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExamQuestionJsonImportModal from "./ExamQuestionJsonImportModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("ExamQuestionJsonImportModal", () => {
  const validJson = {
    version: "qjudge.exam.v1",
    meta: {
      exported_at: "2026-03-02T00:00:00.000Z",
      contest_name: "OS Exam",
    },
    questions: [
      {
        question_type: "true_false",
        prompt: "Linux is kernel",
        score: 2,
        correct_answer: "true",
      },
    ],
  };

  it("renders with primary action disabled before file is parsed", () => {
    render(
      <ExamQuestionJsonImportModal
        open
        contestName="OS Exam"
        onClose={vi.fn()}
        onPreviewImport={vi.fn().mockResolvedValue({
          summary: {
            mode: "append",
            will_add: 1,
            will_delete: 0,
            will_keep: 0,
            score_before: 0,
            score_after: 2,
            score_delta: 2,
          },
          fingerprint: "fp",
        })}
        onApplyImport={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const submitButton = screen.getByRole("button", {
      name: /examJson\.import\.previewAction/i,
    });
    expect(submitButton).toBeDisabled();
  });

  it("shows validation errors and keeps submit disabled for invalid JSON", async () => {
    render(
      <ExamQuestionJsonImportModal
        open
        contestName="OS Exam"
        onClose={vi.fn()}
        onPreviewImport={vi.fn().mockResolvedValue({
          summary: {
            mode: "append",
            will_add: 1,
            will_delete: 0,
            will_keep: 0,
            score_before: 0,
            score_after: 2,
            score_delta: 2,
          },
          fingerprint: "fp",
        })}
        onApplyImport={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const invalidJson = {
      version: "qjudge.exam.v1",
      meta: {
        exported_at: "2026-03-02T00:00:00.000Z",
        contest_name: "OS Exam",
      },
      questions: [
        {
          question_type: "single_choice",
          prompt: "pick",
          score: 5,
          options: ["A", "B"],
          correct_answer: 99,
        },
      ],
    };

    fireEvent.change(screen.getByLabelText(/examJson\.import\.pasteTitle/i), {
      target: { value: JSON.stringify(invalidJson) },
    });

    await waitFor(() => {
      expect(screen.getByText(/questions\[0\]\.correct_answer/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: /examJson\.import\.previewAction/i,
    });
    expect(submitButton).toBeDisabled();
  });

  it("runs preview first, then apply with fingerprint", async () => {
    const onPreviewImport = vi.fn().mockResolvedValue({
      summary: {
        mode: "append",
        will_add: 1,
        will_delete: 0,
        will_keep: 2,
        score_before: 10,
        score_after: 12,
        score_delta: 2,
      },
      fingerprint: "fp-123",
    });
    const onApplyImport = vi.fn().mockResolvedValue(undefined);
    render(
      <ExamQuestionJsonImportModal
        open
        contestName="OS Exam"
        onClose={vi.fn()}
        onPreviewImport={onPreviewImport}
        onApplyImport={onApplyImport}
      />,
    );

    fireEvent.change(screen.getByLabelText(/examJson\.import\.pasteTitle/i), {
      target: { value: JSON.stringify(validJson) },
    });

    fireEvent.click(screen.getByRole("button", { name: /examJson\.import\.previewAction/i }));

    await waitFor(() => expect(onPreviewImport).toHaveBeenCalledTimes(1));
    expect(onPreviewImport).toHaveBeenCalledWith({
      payloadJson: JSON.stringify(validJson),
      importMode: "append",
    });
    await screen.findByText(/examJson\.import\.previewTitle/i, {}, { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: /examJson\.import\.confirmReplace/i }));
    await waitFor(() => expect(onApplyImport).toHaveBeenCalledTimes(1));
    expect(onApplyImport).toHaveBeenCalledWith({
      payloadJson: JSON.stringify(validJson),
      importMode: "append",
      fingerprint: "fp-123",
    });
  });

  it("requires explicit confirmation before apply in replace_all mode", async () => {
    const onPreviewImport = vi.fn().mockResolvedValue({
      summary: {
        mode: "replace_all",
        will_add: 1,
        will_delete: 3,
        will_keep: 0,
        score_before: 15,
        score_after: 2,
        score_delta: -13,
      },
      fingerprint: "fp-456",
    });
    const onApplyImport = vi.fn().mockResolvedValue(undefined);
    render(
      <ExamQuestionJsonImportModal
        open
        contestName="OS Exam"
        onClose={vi.fn()}
        onPreviewImport={onPreviewImport}
        onApplyImport={onApplyImport}
      />,
    );

    const textArea = screen.getByLabelText(/examJson\.import\.pasteTitle/i);
    fireEvent.change(textArea, { target: { value: JSON.stringify(validJson) } });
    fireEvent.click(screen.getByLabelText(/examJson\.import\.modeReplaceAll/i));

    fireEvent.click(screen.getByRole("button", { name: /examJson\.import\.previewAction/i }));
    await waitFor(() => expect(onPreviewImport).toHaveBeenCalledTimes(1));
    await screen.findByText(/examJson\.import\.previewTitle/i, {}, { timeout: 2000 });

    const applyButton = screen.getByRole("button", { name: /examJson\.import\.confirmReplace/i });
    expect(applyButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/examJson\.import\.replaceAllConfirm/i));
    expect(applyButton).not.toBeDisabled();

    fireEvent.click(applyButton);
    await waitFor(() => expect(onApplyImport).toHaveBeenCalledTimes(1));
  });

  it("copies AI prompt template to clipboard", async () => {
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(
      <ExamQuestionJsonImportModal
        open
        contestName="OS Exam"
        onClose={vi.fn()}
        onPreviewImport={vi.fn().mockResolvedValue({
          summary: {
            mode: "append",
            will_add: 1,
            will_delete: 0,
            will_keep: 0,
            score_before: 0,
            score_after: 2,
            score_delta: 2,
          },
          fingerprint: "fp",
        })}
        onApplyImport={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /examJson\.import\.copyPrompt/i }));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledTimes(1));
    expect(writeTextSpy.mock.calls[0][0]).toContain("qjudge.exam.v1");
  });
});
