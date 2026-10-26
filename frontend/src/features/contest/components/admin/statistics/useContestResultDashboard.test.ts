import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  getExamDashboardSummary,
  type ExamDashboardSummaryDto,
} from "@/infrastructure/api/repositories/exam.repository";
import { useContestResultDashboard } from "./useContestResultDashboard";

vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({
  getExamDashboardSummary: vi.fn(),
  getExamDashboardQuestionDetail: vi.fn(),
}));

const codingSummary: ExamDashboardSummaryDto = {
  contest: {
    id: "coding-1",
    name: "Coding Midterm",
    course: "CS101",
    contest_type: "coding",
    participant_count: 12,
    completed_count: 10,
    results_published: false,
  },
  summary: {
    average_score: 150,
    median_score: 160,
    max_total_score: 300,
  },
  score_distribution: [
    { range_label: "0-9%", count: 1 },
    { range_label: "50-59%", count: 3 },
  ],
  questions: [],
};

const codingContest = {
  id: "coding-1",
  name: "Coding Midterm",
  contestType: "coding",
} as ContestDetail;

describe("useContestResultDashboard", () => {
  beforeEach(() => {
    vi.mocked(getExamDashboardSummary).mockReset();
    vi.mocked(getExamDashboardSummary).mockResolvedValue(codingSummary);
  });

  it("loads the dashboard summary for coding contests", async () => {
    const { result } = renderHook(() =>
      useContestResultDashboard(codingContest),
    );

    await waitFor(() => {
      expect(result.current.data?.contest.contestType).toBe("coding");
    });

    expect(getExamDashboardSummary).toHaveBeenCalledTimes(1);
    expect(getExamDashboardSummary).toHaveBeenCalledWith("coding-1");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.scoreDistribution).toEqual([
      { rangeLabel: "0-9%", count: 1 },
      { rangeLabel: "50-59%", count: 3 },
    ]);
  });

  it("retains canonical paper question labels from the dashboard summary", async () => {
    vi.mocked(getExamDashboardSummary).mockResolvedValue({
      ...codingSummary,
      contest: { ...codingSummary.contest, contest_type: "paper_exam" },
      questions: [{
        question_id: "group-child", question_label: "2(b)", order: 4,
        title: "Explain", kind: "essay", max_score: 10, answer_count: 1,
        missing_count: 0, average_score: 5, score_rate: 50, zero_rate: 0,
        full_rate: 0, status: "stable",
      }],
    });
    const { result } = renderHook(() =>
      useContestResultDashboard({ ...codingContest, contestType: "paper_exam" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.questions[0]).toMatchObject({
      questionId: "group-child", questionLabel: "2(b)", order: 4,
    });
  });
});
