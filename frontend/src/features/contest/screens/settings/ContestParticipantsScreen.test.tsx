import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContestParticipant, ParticipantDashboard } from "@/core/entities/contest.entity";
import ContestParticipantsScreen from "./ContestParticipantsScreen";

const useContestAdminMock = vi.fn();
const useContestMock = vi.fn();
const useAuthMock = vi.fn();
const participantDashboardHookMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === "string" ? defaultValue : key,
  }),
}));

vi.mock("@/features/contest/contexts", () => ({
  useContestAdmin: () => useContestAdminMock(),
}));

vi.mock("@/features/contest/contexts/ContestContext", () => ({
  useContest: () => useContestMock(),
}));

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("./participants/useParticipantDashboard", () => ({
  default: (...args: unknown[]) => participantDashboardHookMock(...args),
}));

vi.mock("./participants/ParticipantsListPane", () => ({
  default: ({ selectedUserId }: { selectedUserId?: string | null }) => (
    <div data-testid="participants-list">selected:{selectedUserId || "none"}</div>
  ),
}));

vi.mock("./participants/ParticipantDashboardPane", () => ({
  default: ({
    activeDetail,
    dashboard,
  }: {
    activeDetail: string;
    dashboard: ParticipantDashboard | null;
  }) => (
    <div data-testid="participants-dashboard">
      detail:{activeDetail};type:{dashboard?.contestType || "none"}
    </div>
  ),
}));

vi.mock("@/features/contest/components/modals/AddParticipantModal", () => ({
  AddParticipantModal: () => null,
}));

vi.mock("@/shared/ui/modal", () => ({
  ConfirmModal: () => null,
  useConfirmModal: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    modalProps: {},
  }),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  addContestParticipant: vi.fn(),
  approveTakeover: vi.fn(),
  downloadParticipantReport: vi.fn(),
  removeParticipant: vi.fn(),
  reopenExam: vi.fn(),
  unlockParticipant: vi.fn(),
  updateParticipant: vi.fn(),
}));

const participant: ContestParticipant = {
  userId: "42",
  username: "alice",
  displayName: "Alice",
  nickname: "",
  email: "alice@example.com",
  joinedAt: "2026-03-09T10:00:00Z",
  score: 80,
  examStatus: "submitted",
  lockReason: "",
  startedAt: "2026-03-09T10:00:00Z",
  leftAt: "2026-03-09T10:30:00Z",
  violationCount: 1,
  submitReason: "manual",
};

const makeDashboard = (contestType: "coding" | "paper_exam"): ParticipantDashboard => ({
  contestType,
  participant,
  overview: {
    totalScore: 80,
    maxScore: 100,
    correctRate: contestType === "paper_exam" ? 80 : undefined,
    gradedCount: contestType === "paper_exam" ? 3 : undefined,
    totalQuestions: contestType === "paper_exam" ? 4 : undefined,
    solved: contestType === "coding" ? 2 : undefined,
    totalProblems: contestType === "coding" ? 3 : undefined,
    rank: contestType === "coding" ? 1 : undefined,
    totalParticipants: contestType === "coding" ? 10 : undefined,
    acceptedSubmissions: contestType === "coding" ? 3 : undefined,
    effectiveSubmissions: contestType === "coding" ? 5 : undefined,
    acceptedRate: contestType === "coding" ? 60 : undefined,
  },
  report:
    contestType === "paper_exam"
      ? {
          overviewRows: [],
          questionDetails: [],
        }
      : {
          problemGrid: [],
          problemDetails: [],
          trend: {
            statusCounts: {},
            submissionTimeline: [],
            cumulativeProgress: [],
          },
        },
  timeline: [],
  actions: {
    canDownloadReport: true,
    canEditStatus: true,
    canRemoveParticipant: true,
    canUnlock: false,
    canApproveTakeover: false,
    canReopenExam: false,
    canViewEvidence: contestType === "paper_exam",
    canOpenGrading: contestType === "paper_exam",
  },
  evidence: contestType === "paper_exam" ? [] : undefined,
});

const renderScreen = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/contests/:contestId/settings" element={<ContestParticipantsScreen />} />
      </Routes>
    </MemoryRouter>,
  );

describe("ContestParticipantsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContestAdminMock.mockReturnValue({
      participants: [participant],
      examEvents: [],
      isRefreshing: false,
      refreshAdminData: vi.fn().mockResolvedValue(undefined),
    });
    useAuthMock.mockReturnValue({
      user: { username: "owner" },
    });
  });

  it("restores a valid deep-linked coding detail tab", async () => {
    useContestMock.mockReturnValue({
      contest: { ownerUsername: "owner", permissions: {}, contestType: "coding" },
    });
    participantDashboardHookMock.mockReturnValue({
      data: makeDashboard("coding"),
      loading: false,
      error: "",
      refresh: vi.fn(),
    });

    renderScreen("/contests/contest-1/settings?panel=participants&user=42&detail=submissions");

    await waitFor(() => {
      expect(screen.getByTestId("participants-dashboard")).toHaveTextContent(
        "detail:submissions;type:coding",
      );
    });
  });

  it("normalizes an invalid paper-exam deep-linked detail back to overview", async () => {
    useContestMock.mockReturnValue({
      contest: { ownerUsername: "owner", permissions: {}, contestType: "paper_exam" },
    });
    participantDashboardHookMock.mockReturnValue({
      data: makeDashboard("paper_exam"),
      loading: false,
      error: "",
      refresh: vi.fn(),
    });

    renderScreen("/contests/contest-1/settings?panel=participants&user=42&detail=submissions");

    await waitFor(() => {
      expect(screen.getByTestId("participants-dashboard")).toHaveTextContent(
        "detail:overview;type:paper_exam",
      );
    });
  });
});
