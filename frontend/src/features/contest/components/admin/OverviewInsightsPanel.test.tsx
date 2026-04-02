import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail, ContestOverviewMetrics } from "@/core/entities/contest.entity";
import OverviewInsightsPanel from "./OverviewInsightsPanel";

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
    status: "published",
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
    problems: [
      {
        id: "cp-1",
        problemId: "p-1",
        label: "A",
        title: "Two Sum",
        score: 100,
        order: 0,
      },
      {
        id: "cp-2",
        problemId: "p-2",
        label: "B",
        title: "Graph",
        score: 100,
        order: 1,
      },
    ],
    ...overrides,
  }) as ContestDetail;

const buildMetrics = (contestType: ContestDetail["contestType"]): ContestOverviewMetrics =>
  ({
    onlineNow: 5,
    onlineActiveSessions: 2,
    exam: {
      status: "ended",
      contestType,
    },
    timeProgress: {
      totalSeconds: 7200,
      elapsedSeconds: 7200,
      remainingSeconds: 0,
      progressPercent: 100,
      isStarted: true,
      isEnded: true,
    },
  }) as ContestOverviewMetrics;

describe("OverviewInsightsPanel", () => {
  it("navigates to settings and shows coding problem count", () => {
    const onOpenPanel = vi.fn();

    render(
      <OverviewInsightsPanel
        contest={buildContest({ contestType: "coding" })}
        overviewMetrics={buildMetrics("coding")}
        onOpenPanel={onOpenPanel}
      />,
    );

    expect(screen.queryByText("在線狀態")).not.toBeInTheDocument();
    expect(screen.getByText("problems")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "競賽狀態" }));
    fireEvent.click(screen.getByRole("button", { name: "題目數量" }));

    expect(onOpenPanel).toHaveBeenCalledWith("settings");
    expect(onOpenPanel).toHaveBeenCalledWith("problem_editor");
  });

  it("shows paper exam wording for question count", () => {
    const onOpenPanel = vi.fn();

    render(
      <OverviewInsightsPanel
        contest={buildContest({
          contestType: "paper_exam",
          problems: [],
          examQuestionsCount: 12,
        })}
        overviewMetrics={buildMetrics("paper_exam")}
        onOpenPanel={onOpenPanel}
      />,
    );

    expect(screen.getByText("questions")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
