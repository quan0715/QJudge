import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContestProvider, useContest } from "./ContestContext";

const mockGetContest = vi.fn();
const mockGetRuntimeState = vi.fn();
const mockLiveMonitoringProvider = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/api/repositories", () => ({
  getContest: (...args: unknown[]) => mockGetContest(...args),
  getContestStandings: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({
  EXAM_SUBMITTED_EVENT: "qjudge:exam-submitted",
  getRuntimeState: (...args: unknown[]) => mockGetRuntimeState(...args),
}));

vi.mock("./IntegrityUploadProvider", () => ({
  IntegrityUploadProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./LiveMonitoringProvider", () => ({
  LiveMonitoringProvider: ({ children }: { children: React.ReactNode }) => {
    mockLiveMonitoringProvider();
    return children;
  },
}));

describe("ContestProvider runtime polling", () => {
  beforeEach(() => {
    mockGetContest.mockReset();
    mockGetRuntimeState.mockReset();
    mockLiveMonitoringProvider.mockReset();
    mockGetContest.mockResolvedValue({ id: "contest-1", hasJoined: true });
    mockGetRuntimeState.mockResolvedValue({
      server_now: "2026-09-09T00:00:00Z",
      schedule_revision: 1,
    });
  });

  it("does not request runtime state when polling is disabled for an admin surface", async () => {
    const AdminContent = () => {
      const { contest } = useContest();
      return <div>{contest?.id ?? "loading"}</div>;
    };

    render(
      <MemoryRouter>
        <ContestProvider contestId="contest-1" enableRuntimePolling={false}>
          <AdminContent />
        </ContestProvider>
      </MemoryRouter>,
    );

    await screen.findByText("contest-1");
    await waitFor(() => expect(mockGetContest).toHaveBeenCalledTimes(1));

    expect(mockGetRuntimeState).not.toHaveBeenCalled();
  });

  it("can disable LiveKit publisher creation for the precheck surface", async () => {
    const Content = () => <div>precheck</div>;

    render(
      <MemoryRouter>
        <ContestProvider contestId="contest-1" enableLiveMonitoring={false}>
          <Content />
        </ContestProvider>
      </MemoryRouter>,
    );

    await screen.findByText("precheck");
    expect(mockLiveMonitoringProvider).not.toHaveBeenCalled();
  });
});
