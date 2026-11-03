import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createMockContest } from "@/shared/mocks/contest.mock";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getTargets: vi.fn(),
  requestToken: vi.fn(),
  createTransport: vi.fn(),
  refreshAdminData: vi.fn().mockResolvedValue(undefined),
  refreshParticipants: vi.fn().mockResolvedValue(undefined),
  getDashboard: vi.fn().mockResolvedValue(null),
  registerPanelRefresh: vi.fn(() => () => {}),
  participants: [] as ContestParticipant[],
}));
const translate = vi.hoisted(() => (_key: string, fallback: string, values?: Record<string, unknown>) => fallback.replace(/{{(\w+)}}/g, (_, key) => String(values?.[key] ?? key)));

vi.mock("@/infrastructure/api/repositories/liveMonitoring.repository", () => ({
  getLiveMonitoringConfig: mocks.getConfig,
  getLiveMonitoringTargets: mocks.getTargets,
  requestLiveMonitoringToken: mocks.requestToken,
}));

vi.mock("@/infrastructure/realtime/livekitTransport", () => ({
  createLiveKitTransport: mocks.createTransport,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock("@/features/contest/contexts", () => ({
  useContestAdmin: () => ({ participants: mocks.participants, isRefreshing: false,
    refreshAdminData: mocks.refreshAdminData, refreshParticipants: mocks.refreshParticipants }),
  useAdminPanelRefresh: () => ({ registerPanelRefresh: mocks.registerPanelRefresh }),
}));
vi.mock("@/infrastructure/api/repositories", () => ({
  getParticipantDashboard: mocks.getDashboard, unlockParticipant: vi.fn(), updateParticipant: vi.fn(),
}));
vi.mock("@/shared/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import type { ContestParticipant } from "@/core/entities/contest.entity";
import AdminProctoringPanel from "./AdminProctoringPanel";

const participant = (userId: string): ContestParticipant => ({
  userId,
  username: `student-${userId}`,
  email: `${userId}@test.example`,
  displayName: `Student ${userId}`,
  score: 0,
  joinedAt: "2026-09-16T11:00:00Z",
  examStatus: "in_progress",
  violationCount: 0,
  liveMonitoringOnline: false,
  liveMonitoringSources: [],
  liveMonitoringStatus: "available",
  connectionStatus: "online",
  lastCheckpointAt: null,
  startedAt: null,
  leftAt: null,
  lockedAt: null,
  lockReason: "",
  submitReason: "",
});

beforeEach(() => {
  mocks.participants = [participant("7"), participant("8")];
  mocks.refreshAdminData.mockClear();
  mocks.getConfig.mockReset().mockResolvedValue({
    enabled: true,
    configured: true,
    provider: "livekit",
  });
  mocks.requestToken.mockReset().mockResolvedValue({
    serverUrl: "wss://livekit.example.test",
    token: "subscriber-token",
    roomName: "run-1",
    identity: "qj-proctor",
    runId: "run-1",
    role: "subscriber",
    allowedSources: [],
    expiresAt: "2026-09-16T12:01:00Z",
  });
  mocks.getTargets.mockReset().mockResolvedValue({
    observedAt: "2026-09-16T12:00:00Z",
    stale: false,
    targets: [
      { userId: "7", identity: "qj-student-a", sources: ["screen_share"] },
      { userId: "8", identity: "qj-student-b", sources: ["webcam"] },
    ],
  });
  mocks.createTransport.mockReset().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    selectTarget: vi.fn(),
    selectTargets: vi.fn(),
    bindTargetVideo: vi.fn(),
    bindVideo: vi.fn(),
    onState: vi.fn(() => () => undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }));
});

describe("AdminProctoringPanel", () => {
  it("keeps mode controls in the action bar, remembers grid size, and has one manual refresh", async () => {
    const contest = createMockContest({
      startTime: new Date(Date.now() - 60_000).toISOString(),
      endTime: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const view = render(<MemoryRouter><AdminProctoringPanel contestId="contest-1" contest={contest} /></MemoryRouter>);
    const toggle = view.getByRole("switch", { name: "多人" });
    const toolbarLeft = view.getByRole("heading", { name: "監考面板" }).parentElement!;
    expect(toolbarLeft).toContainElement(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.change(view.getByRole("combobox", { name: "每頁監看人數" }), { target: { value: "9" } });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(view.queryByRole("combobox", { name: "每頁監看人數" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(view.getByRole("combobox", { name: "每頁監看人數" })).toHaveValue("9");
    expect(view.queryAllByRole("button", { name: "重新連線" })).toHaveLength(0);
    expect(view.getAllByRole("button", { name: "重新整理" })).toHaveLength(1);
    await waitFor(() => expect(mocks.createTransport).toHaveBeenCalledOnce());
    fireEvent.click(view.getByRole("button", { name: "重新整理" }));
    await waitFor(() => expect(mocks.createTransport).toHaveBeenCalledTimes(2));
    expect(mocks.refreshAdminData).toHaveBeenCalledOnce();
  });

});
