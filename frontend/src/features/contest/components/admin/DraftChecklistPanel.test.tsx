import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import DraftChecklistPanel from "./DraftChecklistPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      fallback && options
        ? fallback.replace("{{count}}", String(options.count ?? ""))
        : fallback ?? _key,
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
    rules: "",
    startTime: "",
    endTime: "",
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
    participantCount: 20,
    isExamMonitored: false,
    requiresFullscreen: false,
    canSubmitExam: true,
    attendanceCheckEnabled: false,
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

describe("DraftChecklistPanel", () => {
  it("renders checklist and problem CTA", () => {
    const onOpenProblemEditor = vi.fn();
    const onPublishContest = vi.fn().mockResolvedValue(undefined);

    render(
      <DraftChecklistPanel
        contest={buildContest()}
        onOpenProblemEditor={onOpenProblemEditor}
        onOpenSettings={vi.fn()}
        onPublishContest={onPublishContest}
      />,
    );

    expect(screen.getByText("發布前 Checklist")).toBeInTheDocument();
    expect(screen.getByText("草稿階段不需設定時段，發布時會要求你設定開始時間與時長")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "前往題目管理" }));
    expect(onOpenProblemEditor).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "發布競賽" }));
    expect(onPublishContest).toHaveBeenCalledTimes(1);
  });

  it("opens settings from checklist rule item", () => {
    const onOpenSettings = vi.fn();
    render(
      <DraftChecklistPanel
        contest={buildContest({ problems: [{ id: "p1" } as any] })}
        onOpenProblemEditor={vi.fn()}
        onOpenSettings={onOpenSettings}
        onPublishContest={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "開啟完整設定" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
