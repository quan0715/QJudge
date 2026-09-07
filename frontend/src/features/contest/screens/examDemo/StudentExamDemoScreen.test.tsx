import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContestDetail } from "@/core/entities/contest.entity";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import StudentExamDemoScreen from "./StudentExamDemoScreen";

const mocks = vi.hoisted(() => ({
  getContest: vi.fn(),
  getExamQuestions: vi.fn(),
  getContestProblem: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  getContest: mocks.getContest,
}));

vi.mock("@/infrastructure/api/repositories/examQuestions.repository", () => ({
  getExamQuestions: mocks.getExamQuestions,
}));

vi.mock("@/infrastructure/api/repositories/contestProblems.repository", () => ({
  getContestProblem: mocks.getContestProblem,
}));

vi.mock("@/shared/ui/problem", () => ({
  ProblemHeaderCard: () => <div>題目標頭</div>,
  ProblemPreview: () => <div>題目預覽</div>,
}));

vi.mock("../../components/exam/PaperExamCore", () => ({
  PaperExamCore: ({ items, renderItem }: {
    items: Array<unknown>;
    renderItem: (item: unknown, index: number, mode: "single") => React.ReactNode;
  }) => (
    <div data-testid="paper-exam-preview">
      {items[0] ? renderItem(items[0], 0, "single") : null}
    </div>
  ),
}));

vi.mock("@/features/problems/components/solve/editorview/ProblemFullPageSolve", () => ({
  ProblemFullPageSolve: ({
    submissionDisabled,
    renderSubmissions,
  }: {
    submissionDisabled?: boolean;
    renderSubmissions: () => React.ReactNode;
  }) => (
    <div data-testid="coding-editor-preview">
      {submissionDisabled ? "execution-and-submission-disabled" : "submission-enabled"}
      {renderSubmissions()}
    </div>
  ),
}));

vi.mock("@/shared/ui/solver/menu/ProblemMenu", () => ({
  ProblemMenu: () => <div>題目選單</div>,
}));

vi.mock("../../components/solver/submissions/ContestProblemSubmissions", () => ({
  default: ({ contestId, codingProblemId }: { contestId: string; codingProblemId: string }) => (
    <div
      data-testid="contest-problem-submissions"
      data-contest-id={contestId}
      data-coding-problem-id={codingProblemId}
    />
  ),
}));

const codingProblem = {
  id: "problem-1",
  title: "Hello World",
  difficulty: "easy",
  acceptanceRate: 0,
  submissionCount: 0,
  acceptedCount: 0,
  waCount: 0,
  tleCount: 0,
  mleCount: 0,
  reCount: 0,
  ceCount: 0,
  tags: [],
  isSolved: false,
  description: "輸出 Hello World",
  languageConfigs: [
    { language: "cpp", templateCode: "int main() {}", isEnabled: true },
  ],
} satisfies CodingProblemDetail;

const buildContest = (contestType: ContestDetail["contestType"]): ContestDetail => ({
  id: "contest-1",
  name: "測試競賽",
  contestType,
  status: "draft",
  examStatus: "not_started",
  problems: [
    {
      id: "contest-problem-1",
      problemId: codingProblem.id,
      label: "A",
      title: codingProblem.title,
      order: 1,
    },
  ],
} as ContestDetail);

const renderScreen = () => render(
  <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/exam-preview"]}>
    <Routes>
      <Route
        path="/classrooms/:classroomId/contest/:contestId/exam-preview"
        element={<StudentExamDemoScreen />}
      />
    </Routes>
  </MemoryRouter>,
);

describe("StudentExamDemoScreen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the working coding editor and submissions for coding contests", async () => {
    mocks.getContest.mockResolvedValue(buildContest("coding"));
    mocks.getExamQuestions.mockResolvedValue([]);
    mocks.getContestProblem.mockResolvedValue(codingProblem);

    renderScreen();

    expect(await screen.findByTestId("coding-editor-preview")).toHaveTextContent("submission-enabled");
    expect(screen.getByTestId("contest-problem-submissions")).toHaveAttribute(
      "data-coding-problem-id",
      codingProblem.id,
    );
  });

  it("keeps the paper-exam preview for paper exams", async () => {
    mocks.getContest.mockResolvedValue(buildContest("paper_exam"));
    mocks.getExamQuestions.mockResolvedValue([]);
    mocks.getContestProblem.mockResolvedValue(codingProblem);

    renderScreen();

    expect(await screen.findByTestId("paper-exam-preview")).toBeInTheDocument();
  });
});
