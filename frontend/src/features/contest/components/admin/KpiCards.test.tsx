import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail, ContestOverviewMetrics } from "@/core/entities/contest.entity";
import KpiCards from "./KpiCards";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

const buildContest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
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
    problems: [],
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
      elapsedSeconds: 7200,
      remainingSeconds: 0,
      progressPercent: 100,
      isStarted: true,
      isEnded: true,
    },
    ...overrides,
  }) as ContestOverviewMetrics;

describe("KpiCards", () => {
  it("shows draft contest actions and routes to problem editor", () => {
    const onOpenPanel = vi.fn();
    const onPublishContest = vi.fn().mockResolvedValue(undefined);

    render(
      <KpiCards
        contest={buildContest({ status: "draft" })}
        overviewMetrics={buildMetrics({ timeProgress: { totalSeconds: 0, elapsedSeconds: 0, remainingSeconds: 0, progressPercent: 0, isStarted: false, isEnded: false } })}
        onOpenPanel={onOpenPanel}
        onPublishContest={onPublishContest}
        onPublishResults={vi.fn().mockResolvedValue(undefined)}
        onRevokeResults={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "發布競賽" }));
    fireEvent.click(screen.getByRole("button", { name: "前往題目" }));

    expect(onPublishContest).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).toHaveBeenCalledWith("problem_editor");
  });

  it("shows publish-results action after the contest has ended", () => {
    const onOpenPanel = vi.fn();
    const onPublishResults = vi.fn().mockResolvedValue(undefined);

    render(
      <KpiCards
        contest={buildContest({ status: "published", resultsPublished: false })}
        overviewMetrics={buildMetrics()}
        onOpenPanel={onOpenPanel}
        onPublishContest={vi.fn().mockResolvedValue(undefined)}
        onPublishResults={onPublishResults}
        onRevokeResults={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "發布成績" }));
    fireEvent.click(screen.getByRole("button", { name: "前往批改" }));

    expect(onPublishResults).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).toHaveBeenCalledWith("grading");
  });
});
