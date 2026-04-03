import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import OverviewActionWidgets from "./OverviewActionWidgets";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      fallback && options
        ? fallback.replace("{{submitted}}", String(options.submitted ?? ""))
            .replace("{{total}}", String(options.total ?? ""))
            .replace("{{time}}", String(options.time ?? ""))
        : fallback ?? _key,
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

const buildContest = (
  overrides: Partial<ContestDetail> = {},
): ContestDetail =>
  ({
    id: "contest-1",
    name: "Contest",
    description: "",
    startTime: "2026-03-16T09:00:00.000Z",
    endTime: "2026-03-16T11:00:00.000Z",
    status: "draft",
    visibility: "public",
    hasJoined: true,
    isRegistered: true,
    contestType: "coding",
    deliveryMode: "exam",
    cheatDetectionEnabled: false,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
    allowAutoUnlock: false,
    autoUnlockMinutes: 0,
    resultsPublished: false,
    examQuestionsCount: 0,
    participantCount: 20,
    isExamMonitored: false,
    requiresFullscreen: false,
    canSubmitExam: true,
    permissions: {
      canSwitchView: true,
      canEditContest: true,
      canToggleStatus: true,
      canDeleteContest: false,
      canPublishProblems: true,
      canViewAllSubmissions: true,
      canViewFullScoreboard: true,
      canManageClarifications: true,
    },
    problems: [
      { id: "cp-1", problemId: "p-1", label: "A", title: "Two Sum", score: 100, order: 0 },
      { id: "cp-2", problemId: "p-2", label: "B", title: "Graph", score: 100, order: 1 },
    ],
    ...overrides,
  }) as ContestDetail;

describe("OverviewActionWidgets", () => {
  it("shows the four action widgets and routes each widget", () => {
    const onOpenPanel = vi.fn();
    const onPublishContest = vi.fn().mockResolvedValue(undefined);
    const onPublishResults = vi.fn().mockResolvedValue(undefined);
    const onToggleStrictMode = vi.fn().mockResolvedValue(undefined);

    render(
      <OverviewActionWidgets
        contest={buildContest({ status: "draft", participantCount: 136 })}
        kpi={{
          totalParticipants: 136,
          notStartedCount: 12,
          inProgressCount: 34,
          pausedOrLockedCount: 5,
          submittedCount: 85,
        }}
        gradingStats={{
          totalStudents: 136,
          totalParticipants: 136,
          totalQuestions: 2,
          totalAnswers: 100,
          gradedAnswers: 63,
          ungradedAnswers: 37,
          subjectiveTotal: 50,
          subjectiveGraded: 30,
        }}
        violationCount={9}
        onOpenPanel={onOpenPanel}
        onPublishContest={onPublishContest}
        onRevertContestToDraft={vi.fn().mockResolvedValue(undefined)}
        onPublishResults={onPublishResults}
        onRevokeResults={vi.fn().mockResolvedValue(undefined)}
        onToggleStrictMode={onToggleStrictMode}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "競賽狀態 發布競賽" }));
    fireEvent.click(screen.getByRole("button", { name: "參賽者 進入參賽者列表" }));
    fireEvent.click(screen.getByRole("button", { name: "題目數量 前往題目管理" }));
    fireEvent.click(screen.getByRole("button", { name: "考試批改狀態 發布成績" }));
    fireEvent.click(screen.getByRole("button", { name: "違規次數 前往事件面板" }));
    fireEvent.click(screen.getByRole("button", { name: "嚴格考試模式 啟用模式" }));

    expect(onPublishContest).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).toHaveBeenCalledWith("participants");
    expect(onOpenPanel).toHaveBeenCalledWith("problem_editor");
    expect(onOpenPanel).toHaveBeenCalledWith("logs");
    expect(onPublishResults).toHaveBeenCalledWith(63);
    expect(onToggleStrictMode).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("考試進度").length).toBeGreaterThan(0);
  });

  it("supports reverting contest and results after publish", () => {
    const onRevertContestToDraft = vi.fn().mockResolvedValue(undefined);
    const onRevokeResults = vi.fn().mockResolvedValue(undefined);

    render(
      <OverviewActionWidgets
        contest={buildContest({ status: "published", resultsPublished: true })}
        kpi={{
          totalParticipants: 136,
          notStartedCount: 12,
          inProgressCount: 34,
          pausedOrLockedCount: 5,
          submittedCount: 85,
        }}
        violationCount={2}
        onOpenPanel={vi.fn()}
        onPublishContest={vi.fn().mockResolvedValue(undefined)}
        onRevertContestToDraft={onRevertContestToDraft}
        onPublishResults={vi.fn().mockResolvedValue(undefined)}
        onRevokeResults={onRevokeResults}
        onToggleStrictMode={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "競賽狀態 退回草稿" }));
    fireEvent.click(screen.getByRole("button", { name: "考試批改狀態 撤回發布" }));

    expect(onRevertContestToDraft).toHaveBeenCalledTimes(1);
    expect(onRevokeResults).toHaveBeenCalledTimes(1);
  });
});
