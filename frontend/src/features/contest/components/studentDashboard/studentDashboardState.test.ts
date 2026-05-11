import { describe, expect, it } from "vitest";
import type {
  ContestDetail,
  ExamQuestion,
  ScoreboardData,
} from "@/core/entities/contest.entity";
import {
  buildPaperProgressSummary,
  findCurrentUserScoreboardRow,
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
    visibility: "public",
    hasJoined: true,
    isRegistered: true,
    contestType: "coding",
    deliveryMode: "exam",
    countsTowardGrade: true,
    cheatDetectionEnabled: false,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
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

  it("matches scoreboard rows by user id before display name fallback", () => {
    const scoreboardData: ScoreboardData = {
      contestId: "contest-1",
      contestName: "Contest",
      problems: [],
      rows: [
        {
          userId: "2",
          displayName: "same-name",
          solvedCount: 0,
          totalScore: 0,
          penalty: 0,
          rank: 2,
          problems: {},
        },
        {
          userId: "1",
          displayName: "different-name",
          solvedCount: 1,
          totalScore: 100,
          penalty: 0,
          rank: 1,
          problems: {},
        },
      ],
    };

    const row = findCurrentUserScoreboardRow(scoreboardData, {
      id: 1,
      username: "same-name",
      role: "student",
    });

    expect(row?.userId).toBe("1");
  });

  it("builds paper progress without publishing scores early", () => {
    const summary = buildPaperProgressSummary(
      [
        { id: 1, score: 10 },
        { id: 2, score: 15 },
      ] as ExamQuestion[],
      [{ questionId: "1", score: 8 }],
      false,
    );

    expect(summary).toEqual({
      totalItems: 2,
      completedItems: 1,
      attemptedItems: 1,
      totalScore: null,
      maxScore: 25,
    });
  });

  it("includes paper scores after results are published", () => {
    const summary = buildPaperProgressSummary(
      [
        { id: 1, score: 10 },
        { id: 2, score: 15 },
      ] as ExamQuestion[],
      [
        { questionId: "1", score: 8 },
        { questionId: 2, score: 12 },
      ],
      true,
    );

    expect(summary.totalScore).toBe(20);
    expect(summary.completedItems).toBe(2);
  });
});
