import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticipantDashboard } from "@/core/entities/contest.entity";

const mocks = vi.hoisted(() => ({ codingRecords: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));
vi.mock("@carbon/charts-react", () => ({ AreaChart: () => null, DonutChart: () => null }));
vi.mock("@/shared/ui/theme/ThemeContext", () => ({ useTheme: () => ({ theme: "white" }) }));
vi.mock("@/features/contest/components/exam/PaperQuestionReportCard", () => ({
  default: ({ questionId }: { questionId: string }) => <div data-testid="question-card">{questionId}</div>,
}));
vi.mock("@/features/contest/components/studentDashboard/CodingAnswerRecords", () => ({
  default: (props: { initialExpandedProblemId?: string }) => {
    mocks.codingRecords(props);
    return <div data-testid="coding-records" />;
  },
}));

import ParticipantAnswerReport from "./ParticipantAnswerReport";

const status = { code: "graded", label: "已批改", color: "green" };

const paperDashboard = {
  contestType: "paper_exam",
  participant: { userId: "7", username: "s7" },
  report: {
    overviewRows: [{ questionId: "q1", index: 1, questionType: "single_choice", maxScore: 5, score: 5, status }],
    questionDetails: [{ questionId: "q1", index: 1, questionType: "single_choice", prompt: "1+1", maxScore: 5, score: 5, status }],
  },
} as unknown as ParticipantDashboard;

const codingDashboard = {
  contestType: "coding",
  participant: { userId: "7", username: "s7" },
  report: {
    problemGrid: [{ problemId: "p1", label: "A", title: "A+B", score: 100, maxScore: 100, status: "AC", tries: 1 }],
    problemDetails: [{ problemId: "p1", label: "A", title: "A+B", score: 100, maxScore: 100, status: "AC", tries: 1, time: 3 }],
    trend: { submissionTimeline: [], cumulativeProgress: [], statusCounts: {} },
  },
} as unknown as ParticipantDashboard;

beforeEach(() => mocks.codingRecords.mockClear());

describe("ParticipantAnswerReport", () => {
  it("renders paper questions as one expandable table", () => {
    render(<ParticipantAnswerReport contestId="c1" dashboard={paperDashboard} />);
    expect(screen.queryByRole("heading", { name: "題目總覽" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "逐題詳情" })).toBeNull();
    expect(screen.queryByTestId("question-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /展開第 1 題/ }));
    expect(screen.getByTestId("question-card")).toHaveTextContent("q1");
    expect(screen.queryByTestId("coding-records")).toBeNull();
  });

  it("renders coding details and records expanded to the requested problem", () => {
    render(<ParticipantAnswerReport contestId="c1" dashboard={codingDashboard} expandedProblemId="p1" />);
    expect(screen.getByRole("heading", { name: "題目詳情" })).toBeInTheDocument();
    expect(screen.getByTestId("coding-records")).toBeInTheDocument();
    expect(mocks.codingRecords).toHaveBeenCalledWith(expect.objectContaining({ initialExpandedProblemId: "p1" }));
  });

  it("ignores an unknown expanded problem id", () => {
    render(<ParticipantAnswerReport contestId="c1" dashboard={codingDashboard} expandedProblemId="nope" />);
    expect(screen.getByText("A · A+B")).toBeInTheDocument();
  });
});
