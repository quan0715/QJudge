import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ExamQuestionJsonImportModal from "./ExamQuestionJsonImportModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsText(fileLike: unknown): void {
    const source =
      fileLike && typeof fileLike === "object" && "file" in (fileLike as Record<string, unknown>)
        ? (fileLike as { file?: unknown }).file
        : fileLike;

    const file =
      source instanceof File
        ? source
        : source && typeof source === "object" && "blobFile" in (source as Record<string, unknown>)
          ? (source as { blobFile?: File }).blobFile
          : null;

    if (!file) {
      this.onerror?.({ target: this } as unknown as ProgressEvent<FileReader>);
      return;
    }

    file
      .text()
      .then((text) => {
        this.result = text;
        this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
      })
      .catch(() => {
        this.onerror?.({ target: this } as unknown as ProgressEvent<FileReader>);
      });
  }
}

describe("ExamQuestionJsonImportModal", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", MockFileReader);
  });

  it("renders with primary action disabled before file is parsed", () => {
    render(
      <ExamQuestionJsonImportModal
        open
        onClose={vi.fn()}
        onConfirmImport={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const submitButton = screen.getByRole("button", {
      name: /確認覆蓋|confirm|examJson\.import\.confirmReplace/i,
    });
    expect(submitButton).toBeDisabled();
  });

  it("shows validation errors and keeps submit disabled for invalid JSON", async () => {
    const { container } = render(
      <ExamQuestionJsonImportModal
        open
        onClose={vi.fn()}
        onConfirmImport={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

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

    fireEvent.change(input, {
      target: {
        files: [new File([JSON.stringify(invalidJson)], "invalid.json", { type: "application/json" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/questions\[0\]\.correct_answer/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: /確認覆蓋|confirm|examJson\.import\.confirmReplace/i,
    });
    expect(submitButton).toBeDisabled();
  });

  it("shows preview and submits parsed questions for valid JSON", async () => {
    const onConfirmImport = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ExamQuestionJsonImportModal
        open
        onClose={vi.fn()}
        onConfirmImport={onConfirmImport}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

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

    fireEvent.change(input, {
      target: {
        files: [new File([JSON.stringify(validJson)], "valid.json", { type: "application/json" })],
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/預覽|preview|examJson\.import\.previewTitle/i),
      ).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: /確認覆蓋|confirm|examJson\.import\.confirmReplace/i,
    });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onConfirmImport).toHaveBeenCalledTimes(1);
    });

    const payload = onConfirmImport.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect(payload[0].question_type).toBe("true_false");
    expect(payload[0].correct_answer).toBe(0);
  });
});
