import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import ContestExportDialog from "./ContestExportDialog";

const downloadContestFileMock = vi.fn();
const downloadExamPaperFileMock = vi.fn();
const getExamQuestionsMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  getExamQuestions: (...args: unknown[]) => getExamQuestionsMock(...args),
  downloadContestFile: (...args: unknown[]) => downloadContestFileMock(...args),
  downloadExamPaperFile: (...args: unknown[]) => downloadExamPaperFileMock(...args),
}));

const buildContest = (overrides: Partial<ContestDetail> = {}): ContestDetail => ({
  id: "contest-1",
  name: "OS Exam",
  description: "desc",
  startTime: "2026-01-01T10:00:00Z",
  endTime: "2026-01-01T12:00:00Z",
  status: "draft",
  visibility: "private",
  hasJoined: false,
  isRegistered: false,
  contestType: "coding",
  cheatDetectionEnabled: false,
  scoreboardVisibleDuringContest: false,
  allowMultipleJoins: false,
  maxCheatWarnings: 3,
  allowAutoUnlock: false,
  autoUnlockMinutes: 0,
  resultsPublished: false,
  permissions: {
    canSwitchView: true,
    canEditContest: true,
    canToggleStatus: true,
    canPublishProblems: true,
    canViewAllSubmissions: true,
    canViewFullScoreboard: true,
    canManageClarifications: true,
  },
  problems: [
    {
      id: "cp-1",
      problemId: "p-1",
      label: "A",
      title: "Two Sum",
      score: 100,
      order: 0,
    },
  ],
  ...overrides,
});

const buildExamQuestion = (partial: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: partial.id ?? "q-1",
  contestId: partial.contestId ?? "contest-1",
  questionType: partial.questionType ?? "single_choice",
  prompt: partial.prompt ?? "Question",
  options: partial.options ?? ["A", "B"],
  correctAnswer: partial.correctAnswer ?? 0,
  score: partial.score ?? 5,
  order: partial.order ?? 0,
  createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
  updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
});

describe("ContestExportDialog", () => {
  beforeEach(() => {
    downloadContestFileMock.mockReset();
    downloadExamPaperFileMock.mockReset();
    getExamQuestionsMock.mockReset();
    downloadContestFileMock.mockResolvedValue(new Blob(["x"], { type: "text/plain" }));
    downloadExamPaperFileMock.mockResolvedValue(undefined);
    getExamQuestionsMock.mockResolvedValue([]);
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:mock"),
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it("exports markdown when markdown target is selected", async () => {
    render(
      <ContestExportDialog
        open
        onClose={vi.fn()}
        contest={buildContest()}
        contestId="contest-1"
      />
    );

    fireEvent.click(screen.getByLabelText("Markdown — 題目匯出為 Markdown 檔案"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));

    await waitFor(() => {
      expect(downloadContestFileMock).toHaveBeenCalledWith(
        "contest-1",
        "markdown",
        "zh-TW",
        1,
        "normal"
      );
    });
  });

  it("exports answer pdf when answer target is selected", async () => {
    getExamQuestionsMock.mockResolvedValue([buildExamQuestion()]);

    render(
      <ContestExportDialog
        open
        onClose={vi.fn()}
        contest={buildContest({ contestType: "paper_exam", cheatDetectionEnabled: true, problems: [] })}
        contestId="contest-1"
      />
    );

    await screen.findByLabelText("答案卷 — 包含題目、選項與正確答案");
    fireEvent.click(screen.getByLabelText("答案卷 — 包含題目、選項與正確答案"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));

    await waitFor(() => {
      expect(downloadExamPaperFileMock).toHaveBeenCalledWith(
        "contest-1",
        "answer",
        "zh-TW",
        1
      );
    });
  });

  it("still exports backend exam paper when local question list is empty", async () => {
    getExamQuestionsMock.mockResolvedValue([]);

    render(
      <ContestExportDialog
        open
        onClose={vi.fn()}
        contest={buildContest({ contestType: "paper_exam", cheatDetectionEnabled: true, problems: [] })}
        contestId="contest-1"
      />
    );

    await screen.findByLabelText("答案卷 — 包含題目、選項與正確答案");
    fireEvent.click(screen.getByLabelText("答案卷 — 包含題目、選項與正確答案"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));

    await waitFor(() => {
      expect(downloadExamPaperFileMock).toHaveBeenCalledWith(
        "contest-1",
        "answer",
        "zh-TW",
        1
      );
    });
  });

  it("shows loading animation while exporting", async () => {
    const onClose = vi.fn();
    let resolveDownload: ((value: Blob) => void) | null = null;
    downloadContestFileMock.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveDownload = resolve;
        })
    );

    render(
      <ContestExportDialog
        open
        onClose={onClose}
        contest={buildContest()}
        contestId="contest-1"
      />
    );

    fireEvent.click(screen.getByLabelText("Markdown — 題目匯出為 Markdown 檔案"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));

    expect(screen.getByText("匯出中...")).toBeInTheDocument();
    expect(screen.getByText("正在匯出 Markdown...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    resolveDownload?.(new Blob(["ok"], { type: "text/markdown" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
