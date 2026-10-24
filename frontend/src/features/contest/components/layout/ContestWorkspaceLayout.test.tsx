import { fireEvent, render, screen } from "@testing-library/react";
import ContestWorkspaceLayout from "./ContestWorkspaceLayout";
import { getContest } from "@/infrastructure/api/repositories";
import type { ContestDetail } from "@/core/entities/contest.entity";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ contestId: "c", classroomId: "room" }),
  useLocation: () => ({ pathname: "/classrooms/room/contest/c", search: "" }),
  useNavigate: () => vi.fn(), Outlet: () => <p>Contest content</p>,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }) }));
vi.mock("@/infrastructure/api/repositories", () => ({ getContest: vi.fn(), getContestStandings: vi.fn() }));
vi.mock("@/features/contest/hooks/useExamRuntimeState", () => ({
  useExamRuntimeState: () => ({ state: null, refresh: vi.fn() }),
  mergeExamRuntimeState: (contest: unknown) => contest,
}));
vi.mock("@/features/contest/hooks/useContestExamActions", () => ({ useContestExamActions: () => ({ submissionProgress: { state: {} } }) }));
vi.mock("@/features/contest/components/exam/ExamSubmissionProgressModal", () => ({ default: () => null }));
vi.mock("@/features/contest/components/ExamModeWrapper", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/features/contest/contexts/ContestContext", () => ({ ContestProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/features/contest/contexts/ContestRuntimeNavigatorContext", () => ({ ContestRuntimeNavigatorProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/features/contest/contexts/ContestJudgeQueueProvider", () => ({ ContestJudgeQueueProvider: ({ children }: { children: React.ReactNode }) => children }));

it("renders a retry action for initial service failure and opens the contest after retry", async () => {
  vi.mocked(getContest).mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValue({
    id: "c", status: "published", startTime: "2020-01-01", endTime: "2099-01-01", problems: [],
  } as unknown as ContestDetail);
  render(<ContestWorkspaceLayout />);
  expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
  expect(screen.queryByText("Contest content")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重試" }));
  expect(await screen.findByText("Contest content")).toBeInTheDocument();
  expect(screen.queryByText("Service unavailable")).not.toBeInTheDocument();
});
