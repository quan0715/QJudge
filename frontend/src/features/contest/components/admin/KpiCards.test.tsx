import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail, ContestOverviewMetrics } from "@/core/entities/contest.entity";
import KpiCards from "./KpiCards";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        "adminOverview.actions.publishContest": "發布競賽",
        "adminOverview.actions.publishResults": "發布成績",
        "adminOverview.widgets.goProblemManagement": "前往題目",
        "adminOverview.widgets.gradingStatus": "前往批改",
        "adminOverview.widgets.participants": "參賽者",
        "adminOverview.widgets.status": "考試類型",
        "adminOverview.kpi.personUnit": "人",
      };
      return translations[key] || fallback || key;
    },
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
    cheatDetectionEnabled: false,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    resultsPublished: false,
    examQuestionsCount: 0,
    participantCount: 24,
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
  it("renders status, participant count, and basic actions", () => {
    const onOpenPanel = vi.fn();

    render(
      <KpiCards
        contest={buildContest({ status: "draft", participantCount: 24 })}
        onOpenPanel={onOpenPanel}
      />,
    );

    expect(screen.getByText("參賽者")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("人")).toBeInTheDocument();
    expect(screen.getByText("考試類型")).toBeInTheDocument();
    
    // Check basic actions
    expect(screen.getByRole("button", { name: /設定/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /開啟競賽主頁/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /設定/ }));
    expect(onOpenPanel).toHaveBeenCalledWith("settings");
  });

  it("prefers onOpenSettings callback when provided", () => {
    const onOpenSettings = vi.fn();
    const onOpenPanel = vi.fn();

    render(
      <KpiCards
        contest={buildContest({ status: "draft" })}
        onOpenPanel={onOpenPanel}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /設定/ }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).not.toHaveBeenCalled();
  });
});
