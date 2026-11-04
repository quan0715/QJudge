import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { createMockContest } from "@/shared/mocks/contest.mock";
import type { ContestParticipant, ParticipantDashboard } from "@/core/entities/contest.entity";

const mocks = vi.hoisted(() => ({
  participants: [] as ContestParticipant[],
  refreshAdminData: vi.fn(),
  registerPanelRefresh: vi.fn(() => () => {}),
  getDashboard: vi.fn(),
  answerReport: vi.fn(),
  location: { search: "" },
  stageMounts: 0,
  stageProps: [] as Array<{ layout?: number; gridPage?: number; participant: ContestParticipant | null }>,
}));
const translate = vi.hoisted(
  () => (key: string, fallback?: string | { defaultValue?: string }, values?: Record<string, unknown>) =>
    (typeof fallback === "string" ? fallback : fallback?.defaultValue ?? key).replace(
      /{{(\w+)}}/g,
      (_, name) => String(values?.[name] ?? ""),
    ),
);

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("@/features/contest/contexts", () => ({
  useContestAdmin: () => ({
    participants: mocks.participants,
    initialLoading: false,
    isRefreshing: false,
    refreshAdminData: mocks.refreshAdminData,
  }),
  useAdminPanelRefresh: () => ({ registerPanelRefresh: mocks.registerPanelRefresh }),
}));
vi.mock("@/infrastructure/api/repositories", () => ({
  getParticipantDashboard: mocks.getDashboard,
  unlockParticipant: vi.fn(),
  reopenExam: vi.fn(),
  resetParticipantExamRecord: vi.fn(),
  updateParticipant: vi.fn(),
  downloadParticipantReport: vi.fn(),
}));
vi.mock("@/infrastructure/api/repositories/liveMonitoring.repository", () => ({
  getLiveMonitoringConfig: vi.fn().mockResolvedValue({ enabled: false, configured: false, provider: "livekit" }),
  getLiveMonitoringTargets: vi.fn().mockResolvedValue({ stale: false, observedAt: null, targets: [] }),
  requestLiveMonitoringToken: vi.fn(),
}));
vi.mock("@/infrastructure/realtime/livekitTransport", () => ({ createLiveKitTransport: vi.fn() }));
vi.mock("@/shared/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/features/contest/components/participants/ParticipantAnswerReport", () => ({
  default: (props: { expandedProblemId?: string }) => {
    mocks.answerReport(props);
    return <div data-testid="answer-report" />;
  },
}));

vi.mock("./ProctorLiveStage", async () => {
  const React = await import("react");
  return {
    MinimalLiveStage: (props: {
      layout?: number;
      gridPage?: number;
      participant: ContestParticipant | null;
      onGridPageChange?: (page: number) => void;
      onSelectParticipant?: (userId: string) => void;
    }) => {
      mocks.stageProps.push(props);
      React.useEffect(() => {
        mocks.stageMounts += 1;
      }, []);
      return React.createElement(
        "div",
        { "data-testid": `stage-${props.layout ?? 1}` },
        React.createElement("button", { type: "button", onClick: () => props.onGridPageChange?.(3) }, "page 4"),
        React.createElement("button", { type: "button", onClick: () => props.onSelectParticipant?.("8") }, "tile 8"),
      );
    },
  };
});

import AdminParticipantsPanel from "./AdminParticipantsPanel";

const participant = (userId: string, overrides: Partial<ContestParticipant> = {}): ContestParticipant => ({
  userId,
  username: `student-${userId}`,
  displayName: `Student ${userId}`,
  score: 0,
  joinedAt: "2026-11-03T09:00:00Z",
  examStatus: "in_progress",
  violationCount: 0,
  connectionStatus: "online",
  liveMonitoringOnline: false,
  ...overrides,
});

const dashboardFor = (userId: string, examStatus = "in_progress"): ParticipantDashboard =>
  ({
    contestType: "coding",
    participant: { ...participant(userId), examStatus, startedAt: "2026-11-03T09:01:00Z" },
    overview: { totalScore: 0, maxScore: 100 },
    report: { problemGrid: [], problemDetails: [], trend: { submissionTimeline: [], cumulativeProgress: [], statusCounts: {} } },
    timeline: [],
    eventFeed: [],
    actions: {
      canDownloadReport: true,
      canEditStatus: true,
      canUnlock: examStatus === "locked",
      canReopenExam: false,
      canViewEvidence: true,
      canOpenGrading: false,
    },
  }) as unknown as ParticipantDashboard;

const LocationProbe = () => {
  mocks.location.search = useLocation().search;
  return null;
};

const runningContest = () =>
  createMockContest({
    startTime: new Date(Date.now() - 60_000).toISOString(),
    endTime: new Date(Date.now() + 3_600_000).toISOString(),
  });
const finishedContest = () =>
  createMockContest({
    startTime: new Date(Date.now() - 7_200_000).toISOString(),
    endTime: new Date(Date.now() - 3_600_000).toISOString(),
  });

const renderPanel = (search: string, contest = runningContest()) =>
  render(
    <MemoryRouter initialEntries={[`/admin${search}`]}>
      <AdminParticipantsPanel contestId="c1" contest={contest} />
      <LocationProbe />
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.participants = [participant("7"), participant("8")];
  mocks.getDashboard.mockReset().mockImplementation(async (_c: string, userId: string) => dashboardFor(userId));
  mocks.answerReport.mockClear();
  mocks.stageMounts = 0;
  mocks.stageProps = [];
  mocks.refreshAdminData.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe("AdminParticipantsPanel", () => {
  it("opens in table view and selecting a row shows the student dashboard", async () => {
    renderPanel("?panel=participants");
    expect(screen.getByRole("heading", { name: "參賽者" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("row", { name: /Student 7/ }));
    await waitFor(() => expect(mocks.location.search).toContain("user=7"));
    expect(await screen.findByRole("heading", { name: "Student 7" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "總覽" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "考試狀態" })).toBeVisible();
    expect(screen.getByTestId("answer-report")).not.toBeVisible();
  });

  it("switches the student dashboard between overview, answers and events tabs", async () => {
    renderPanel("?panel=participants&user=7");
    await screen.findByRole("heading", { name: "Student 7" });
    fireEvent.click(screen.getByRole("tab", { name: "作答" }));
    expect(screen.getByTestId("answer-report")).toBeVisible();
    expect(screen.getByRole("heading", { name: "考試狀態", hidden: true })).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "事件" }));
    expect(screen.getByText("目前沒有事件")).toBeVisible();
    expect(screen.getByTestId("answer-report")).not.toBeVisible();
  });

  it("switches to the card view", () => {
    renderPanel("?panel=participants");
    fireEvent.click(screen.getByRole("tab", { name: "卡片" }));
    expect(mocks.location.search).toContain("view=cards");
    expect(screen.getByRole("button", { name: /Student 8/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("back to list returns to the monitor grid it came from", async () => {
    renderPanel("?panel=participants&monitor=1&user=7");
    await screen.findByRole("heading", { name: "Student 7" });
    fireEvent.click(screen.getByRole("button", { name: "返回列表" }));
    expect(mocks.location.search).toContain("monitor=1");
    expect(mocks.location.search).not.toContain("user=");
    expect(screen.getByRole("switch", { name: "監考模式" })).toHaveAttribute("aria-checked", "true");
  });

  it("hides the live stage and disables monitor mode outside the exam window", async () => {
    renderPanel("?panel=participants&user=7", finishedContest());
    await screen.findByRole("heading", { name: "Student 7" });
    expect(screen.queryByText("即時畫面")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回列表" }));
    expect(screen.getByRole("switch", { name: "監考模式" })).toBeDisabled();
  });

  it("shows the live stage in its own column during the exam", async () => {
    renderPanel("?panel=participants&user=7");
    await screen.findByRole("heading", { name: "Student 7" });
    const live = screen.getByRole("complementary", { name: "即時畫面" });
    expect(within(live).getByTestId("stage-1")).toBeVisible();
    expect(screen.queryByRole("button", { name: /事件列表/ })).toBeNull();
  });

  it("turns monitor mode off when the exam ends", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const contest = createMockContest({
      startTime: new Date(Date.now() - 60_000).toISOString(),
      endTime: new Date(Date.now() + 5_000).toISOString(),
    });
    renderPanel("?panel=participants&monitor=1", contest);
    expect(mocks.location.search).toContain("monitor=1");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(mocks.location.search).not.toContain("monitor=1");
  });

  it("overlays live roster fields onto the selected dashboard", async () => {
    mocks.participants = [participant("7", { examStatus: "locked" }), participant("8")];
    renderPanel("?panel=participants&user=7");
    const header = (await screen.findByRole("heading", { name: "Student 7" })).closest("section")!;
    expect(within(header).getByText("locked")).toBeInTheDocument();
  });

  it("opens the answers tab for ?problem and passes it to the answer report", async () => {
    renderPanel("?panel=participants&user=7&problem=p2");
    await screen.findByTestId("answer-report");
    expect(screen.getByRole("tab", { name: "作答" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("answer-report")).toBeVisible();
    expect(mocks.answerReport).toHaveBeenLastCalledWith(expect.objectContaining({ expandedProblemId: "p2" }));
  });

  it("filters by score band instead of exam status", () => {
    mocks.participants = [
      participant("7", { score: 90 }),
      participant("8", { score: 10 }),
      participant("9", { score: 50 }),
      participant("10", { score: 40 }),
    ];
    renderPanel("?panel=participants");
    expect(screen.queryByRole("combobox", { name: "篩選狀態" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "分數篩選" }), { target: { value: "bottom" } });
    expect(mocks.location.search).toContain("score=bottom");
    expect(screen.getByRole("row", { name: /Student 8/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Student 7/ })).not.toBeInTheDocument();
  });

  it("keeps the toolbar search for the side list while a student is open", async () => {
    mocks.participants = [participant("7", { score: 10 }), participant("8", { score: 80 })];
    renderPanel("?panel=participants&user=7", finishedContest());
    await screen.findByRole("heading", { name: "Student 7" });
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    const list = screen.getAllByRole("button", { name: /Student \d/ }).map((button) => button.textContent);
    expect(list[0]).toContain("80.00");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "student-8" } });
    expect(screen.queryByRole("button", { name: /Student 7/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Student 7" })).toBeInTheDocument();
  });

  it("filters the table with the search box", () => {
    renderPanel("?panel=participants&q=student-8");
    expect(screen.queryByRole("row", { name: /Student 7/ })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Student 8/ })).toBeInTheDocument();
  });
  it("keeps one live stage mounted while switching students", async () => {
    renderPanel("?panel=participants&user=7");
    await screen.findByRole("heading", { name: "Student 7" });
    const mountsBefore = mocks.stageMounts;
    fireEvent.click(screen.getByRole("button", { name: /Student 8/ }));
    await screen.findByRole("heading", { name: "Student 8" });
    expect(mocks.stageMounts).toBe(mountsBefore);
    expect(mocks.stageProps.at(-1)?.participant?.userId).toBe("8");
  });

  it("keeps the student header when a dashboard refresh fails", async () => {
    renderPanel("?panel=participants&user=7");
    await screen.findByRole("heading", { name: "Student 7" });
    mocks.getDashboard.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() => expect(screen.getByText("部分資料可能不是最新")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Student 7" })).toBeInTheDocument();
  });

  it("returns to the same monitor grid page after viewing a student", async () => {
    renderPanel("?panel=participants&monitor=1");
    fireEvent.click(screen.getByRole("button", { name: "page 4" }));
    fireEvent.click(screen.getByRole("button", { name: "tile 8" }));
    await screen.findByRole("heading", { name: "Student 8" });
    fireEvent.click(screen.getByRole("button", { name: "返回列表" }));
    expect(screen.getByTestId("stage-4")).toBeInTheDocument();
    expect(mocks.stageProps.at(-1)?.gridPage).toBe(3);
  });
});
