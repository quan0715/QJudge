import { describe, expect, it } from "vitest";
import type {
  ContestDetail,
  ExamQuestion,
} from "@/core/entities/contest.entity";
import {
  buildPaperProgressSummary,
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
});
