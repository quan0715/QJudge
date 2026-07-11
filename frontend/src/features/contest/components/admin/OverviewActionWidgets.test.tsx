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
    problems: [
      { id: "cp-1", problemId: "p-1", label: "A", title: "Two Sum", score: 100, order: 0 },
      { id: "cp-2", problemId: "p-2", label: "B", title: "Graph", score: 100, order: 1 },
    ],
    ...overrides,
  }) as ContestDetail;

describe("OverviewActionWidgets", () => {
  it("shows draft-focused widgets and hides participant/grading/violation cards", () => {
    const onOpenPanel = vi.fn();
    const onPublishContest = vi.fn().mockResolvedValue(undefined);
    const onToggleStrictMode = vi.fn().mockResolvedValue(undefined);
    const onRequestToggleAllowMultipleJoins = vi.fn().mockResolvedValue(undefined);
    const onRequestToggleAttendanceCheck = vi.fn().mockResolvedValue(undefined);
    const onOpenChecklist = vi.fn();
    const onOpenScheduleSettings = vi.fn();

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
        onOpenChecklist={onOpenChecklist}
        onOpenScheduleSettings={onOpenScheduleSettings}
        onPublishContest={onPublishContest}
        onRevertContestToDraft={vi.fn().mockResolvedValue(undefined)}
        onPublishResults={vi.fn().mockResolvedValue(undefined)}
        onRevokeResults={vi.fn().mockResolvedValue(undefined)}
        onToggleStrictMode={onToggleStrictMode}
        onRequestToggleAllowMultipleJoins={onRequestToggleAllowMultipleJoins}
        onRequestToggleAttendanceCheck={onRequestToggleAttendanceCheck}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "競賽狀態 發布競賽" }));
    fireEvent.click(screen.getByRole("button", { name: "題目數量 前往題目管理" }));
    fireEvent.click(screen.getByRole("button", { name: "允許重新加入 啟用重進" }));
    fireEvent.click(screen.getByRole("button", { name: "QR 簽到簽退 啟用簽到" }));
    fireEvent.click(screen.getByRole("button", { name: "發佈代辦事件數量 檢視代辦" }));
    fireEvent.click(screen.getByRole("button", { name: "防作弊監控 啟用模式" }));
    fireEvent.click(screen.getByRole("button", { name: "考試進度 編輯時間" }));

    expect(onPublishContest).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).toHaveBeenCalledWith("problem_editor");
    expect(onRequestToggleAllowMultipleJoins).toHaveBeenCalledTimes(1);
    expect(onRequestToggleAttendanceCheck).toHaveBeenCalledTimes(1);
    expect(onOpenChecklist).toHaveBeenCalledTimes(1);
    expect(onToggleStrictMode).toHaveBeenCalledTimes(1);
    expect(onOpenScheduleSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("考試批改狀態")).not.toBeInTheDocument();
    expect(screen.queryByText("參賽者")).not.toBeInTheDocument();
    expect(screen.queryByText("違規次數")).not.toBeInTheDocument();
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

  it("shows unscheduled copy when start/end time are missing", () => {
    const onOpenScheduleSettings = vi.fn();
    render(
      <OverviewActionWidgets
        contest={buildContest({ startTime: "", endTime: "", status: "draft" })}
        kpi={{
          totalParticipants: 20,
          notStartedCount: 20,
          inProgressCount: 0,
          pausedOrLockedCount: 0,
          submittedCount: 0,
        }}
        violationCount={0}
        onOpenPanel={vi.fn()}
        onPublishContest={vi.fn().mockResolvedValue(undefined)}
        onRevertContestToDraft={vi.fn().mockResolvedValue(undefined)}
        onPublishResults={vi.fn().mockResolvedValue(undefined)}
        onRevokeResults={vi.fn().mockResolvedValue(undefined)}
        onToggleStrictMode={vi.fn().mockResolvedValue(undefined)}
        onOpenScheduleSettings={onOpenScheduleSettings}
      />,
    );

    expect(screen.queryByText(/未設定 — 未設定/)).not.toBeInTheDocument();
    expect(screen.getByText("尚未排程，請先發布並設定時段")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "考試進度 設定時間" }));
    expect(onOpenScheduleSettings).toHaveBeenCalledTimes(1);
  });
});
