import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import ContestExportDialog from "./ContestExportDialog";

const downloadContestFileMock = vi.fn();
const getExamQuestionsMock = vi.fn();
const exportPdfMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  getExamQuestions: (...args: unknown[]) => getExamQuestionsMock(...args),
  downloadContestFile: (...args: unknown[]) => downloadContestFileMock(...args),
}));

vi.mock("@/features/contest/screens/examEdit/pdf/useExamPdfExport", () => ({
  useExamPdfExport: () => ({
    exportPdf: exportPdfMock,
    generating: false,
  }),
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
  examModeEnabled: false,
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
    getExamQuestionsMock.mockReset();
    exportPdfMock.mockReset();
    downloadContestFileMock.mockResolvedValue(new Blob(["x"], { type: "text/plain" }));
    getExamQuestionsMock.mockResolvedValue([]);
    exportPdfMock.mockResolvedValue(undefined);
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
        contest={buildContest({ examModeEnabled: true, problems: [] })}
        contestId="contest-1"
      />
    );

    await screen.findByLabelText("答案卷 — 包含題目、選項與正確答案");
    fireEvent.click(screen.getByLabelText("答案卷 — 包含題目、選項與正確答案"));
    fireEvent.click(screen.getByRole("button", { name: "匯出" }));

    await waitFor(() => {
      expect(exportPdfMock).toHaveBeenCalledWith("answer");
    });
  });
});
