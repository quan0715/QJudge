import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail, ContestOverviewMetrics } from "@/core/entities/contest.entity";
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

const buildMetrics = (
  overrides: Partial<ContestOverviewMetrics> = {},
): ContestOverviewMetrics =>
  ({
    onlineNow: 5,
    onlineActiveSessions: 2,
    exam: {
      status: "ended",
      contestType: "coding",
    },
    timeProgress: {
      totalSeconds: 7200,
      elapsedSeconds: 3600,
      remainingSeconds: 3600,
      progressPercent: 50,
      isStarted: true,
      isEnded: false,
    },
    ...overrides,
  }) as ContestOverviewMetrics;

describe("OverviewActionWidgets", () => {
  it("shows the four action widgets and routes each widget", () => {
    const onOpenPanel = vi.fn();
    const onPublishContest = vi.fn().mockResolvedValue(undefined);

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
        overviewMetrics={buildMetrics()}
        onOpenPanel={onOpenPanel}
        onPublishContest={onPublishContest}
        onPublishResults={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "競賽狀態 發布競賽" }));
    fireEvent.click(screen.getByRole("button", { name: "參賽者 查看統計" }));
    fireEvent.click(screen.getByRole("button", { name: "題目數量 前往題目" }));
    fireEvent.click(screen.getByRole("button", { name: "考試批改狀態 前往批改" }));

    expect(onPublishContest).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).toHaveBeenCalledWith("statistics");
    expect(onOpenPanel).toHaveBeenCalledWith("problem_editor");
    expect(onOpenPanel).toHaveBeenCalledWith("grading");
    expect(screen.getAllByText("考試進度").length).toBeGreaterThan(0);
  });

  it("switches the status widget action after the contest ends", () => {
    const onOpenPanel = vi.fn();
    const onPublishResults = vi.fn().mockResolvedValue(undefined);

    render(
      <OverviewActionWidgets
        contest={buildContest({ status: "published", resultsPublished: false })}
        kpi={{
          totalParticipants: 136,
          notStartedCount: 12,
          inProgressCount: 34,
          pausedOrLockedCount: 5,
          submittedCount: 85,
        }}
        overviewMetrics={buildMetrics({
          timeProgress: {
            totalSeconds: 7200,
            elapsedSeconds: 7200,
            remainingSeconds: 0,
            progressPercent: 100,
            isStarted: true,
            isEnded: true,
          },
        })}
        onOpenPanel={onOpenPanel}
        onPublishContest={vi.fn().mockResolvedValue(undefined)}
        onPublishResults={onPublishResults}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "競賽狀態 發布成績" }));

    expect(onPublishResults).toHaveBeenCalledTimes(1);
  });
});
