import { describe, expect, it } from "vitest";
import type {
  ContestDetail,
  ExamQuestion,
} from "@/core/entities/contest.entity";
import {
  buildCodingProgressSummary,
  buildCodingResultItems,
  buildPaperProgressSummary,
  resolveResultTileState,
  resolveStudentContestPhase,
} from "./studentDashboardState";

const createContest = (
  overrides: Partial<ContestDetail> = {},
): ContestDetail =>
  ({
    id: "contest-1",
    name: "Contest",
    description: "",
    startTime: "2026-05-05T10:00:00.000Z",
    endTime: "2026-05-05T12:00:00.000Z",
    status: "published",
    hasJoined: true,
    canParticipate: true,
    contestType: "coding",
    cheatDetectionEnabled: false,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    resultsPublished: false,
    examQuestionsCount: 0,
    isExamMonitored: false,
    requiresFullscreen: false,
    canSubmitExam: true,
    examStatus: "not_started",
    permissions: {
      canSwitchView: true,
      canEditContest: false,
      canToggleStatus: false,
      canDeleteContest: false,
      canPublishProblems: false,
      canViewAllSubmissions: false,
      canViewFullScoreboard: false,
      canManageClarifications: false,
    },
    problems: [],
    ...overrides,
  }) as ContestDetail;

describe("studentDashboardState", () => {
  it("resolves before, during, and after phases", () => {
    expect(
      resolveStudentContestPhase(
        createContest(),
        Date.parse("2026-05-05T09:00:00.000Z"),
      ),
    ).toBe("before");

    expect(
      resolveStudentContestPhase(
        createContest({ examStatus: "in_progress" }),
        Date.parse("2026-05-05T09:00:00.000Z"),
      ),
    ).toBe("during");

    expect(
      resolveStudentContestPhase(
        createContest({ examStatus: "submitted" }),
        Date.parse("2026-05-05T09:00:00.000Z"),
      ),
    ).toBe("after");
  });

  it("builds paper progress without publishing scores early", () => {
    const summary = buildPaperProgressSummary(
      [
        { id: 1, score: 10 },
        { id: 2, score: 15 },
      ] as ExamQuestion[],
      [{ questionId: "1" }],
      null,
    );

    expect(summary).toEqual({
      totalItems: 2,
      completedItems: 1,
      attemptedItems: 1,
      totalScore: null,
      maxScore: 25,
    });
  });

  it("uses the server's policy-adjusted totals after results are published", () => {
    const summary = buildPaperProgressSummary(
      [
        { id: 1, score: 10 },
        { id: 2, score: 15 },
      ] as ExamQuestion[],
      [
        { questionId: "1" },
        { questionId: 2 },
      ],
      { totalScore: 23.5, maxTotalScore: 20 },
    );

    expect(summary.totalScore).toBe(23.5);
    expect(summary.maxScore).toBe(20);
    expect(summary.completedItems).toBe(2);
  });

  describe("coding results read like paper results", () => {
    const problems = [
      { id: "b1", problemId: "p1", label: "A", title: "A", order: 1, maxScore: 100, userStatus: "AC", userScore: 80 },
      { id: "b2", problemId: "p2", label: "B", title: "B", order: 2, maxScore: 100, userStatus: "WA", userScore: 40 },
      { id: "b3", problemId: "p3", label: "C", title: "C", order: 3, maxScore: 100, userStatus: "WA", userScore: 0 },
      { id: "b4", problemId: "p4", label: "D", title: "D", order: 4, maxScore: 100 },
    ] as ContestDetail["problems"];

    it("totals by the scoreboard's rule, and only once results are published", () => {
      expect(buildCodingProgressSummary(createContest({ problems })).totalScore).toBeNull();
      // Accepted earns full marks even when the stored best score is lower.
      expect(buildCodingProgressSummary(createContest({ problems, resultsPublished: true })).totalScore).toBe(140);
    });

    it("shows verdicts before publishing and points after, like paper answers", () => {
      const before = buildCodingResultItems(createContest({ problems })).map(resolveResultTileState);
      expect(before).toEqual(["accepted", "attempted", "attempted", "unanswered"]);
      const after = buildCodingResultItems(createContest({ problems, resultsPublished: true })).map(resolveResultTileState);
      expect(after).toEqual(["full", "partial", "zero", "unanswered"]);
    });

    it("marks paper answers by points, never by the isCorrect flag", () => {
      const paper = { key: "q", label: "1", answered: true, maxScore: 10 };
      expect(resolveResultTileState({ ...paper, score: null })).toBe("answered");
      expect(resolveResultTileState({ ...paper, score: 10 })).toBe("full");
      expect(resolveResultTileState({ ...paper, score: 4 })).toBe("partial");
      expect(resolveResultTileState({ ...paper, score: 0 })).toBe("zero");
    });
  });
});
