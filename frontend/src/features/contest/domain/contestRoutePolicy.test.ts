import { describe, expect, it } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  getContestAnsweringEntryPath,
  getContestDashboardPath,
  getContestPaperAnsweringPath,
  getContestPrecheckPath,
  getContestSolvePath,
  getFirstContestProblemId,
  getPaperSubmitReviewBackPath,
  getPostPrecheckPath,
  isPathWithinContest,
  shouldRouteToPrecheck,
} from "./contestRoutePolicy";

const createContest = (
  overrides: Partial<ContestDetail> = {},
): ContestDetail =>
  ({
    id: "contest-1",
    name: "Contest",
    description: "",
    startTime: "",
    endTime: "",
    status: "published",
    visibility: "public",
    hasJoined: true,
    isRegistered: true,
    contestType: "coding",
    cheatDetectionEnabled: true,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
    allowAutoUnlock: false,
    autoUnlockMinutes: 0,
    resultsPublished: false,
    examQuestionsCount: 0,
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

describe("contestRoutePolicy", () => {
  it("builds contest paths", () => {
    expect(getContestDashboardPath("42")).toBe("/contests/42");
    expect(getContestPrecheckPath("42")).toBe("/contests/42/exam-precheck");
    expect(getContestSolvePath("42", "p1")).toBe("/contests/42/solve/p1");
    expect(getContestPaperAnsweringPath("42", "q 1")).toBe(
      "/contests/42/paper-exam/answering?q=q%201",
    );
  });

  it("selects first problem by order for coding contests", () => {
    const contest = createContest({
      problems: [
        { id: "2", problemId: "p2", label: "B", title: "P2", order: 2, score: 100 },
        { id: "1", problemId: "p1", label: "A", title: "P1", order: 1, score: 100 },
      ],
    });
    expect(getFirstContestProblemId(contest)).toBe("p1");
    expect(getPostPrecheckPath("42", contest)).toBe("/contests/42/solve/p1");
    expect(getContestAnsweringEntryPath("42", contest)).toBe("/contests/42/solve/p1");
  });

  it("routes paper contests to paper answering after precheck", () => {
    const contest = createContest({ contestType: "paper_exam" });
    expect(getPostPrecheckPath("42", contest)).toBe("/contests/42/paper-exam/answering");
  });

  it("returns dashboard fallback when coding contest has no problem", () => {
    expect(getPostPrecheckPath("42", createContest({ problems: [] }))).toBe("/contests/42");
  });

  it("computes precheck redirect decision", () => {
    expect(
      shouldRouteToPrecheck({
        contest: createContest({ examStatus: "not_started", cheatDetectionEnabled: true }),
        precheckPassed: false,
      }),
    ).toBe(true);
    expect(
      shouldRouteToPrecheck({
        contest: createContest({ examStatus: "in_progress", cheatDetectionEnabled: true }),
        precheckPassed: false,
      }),
    ).toBe(true);
    expect(
      shouldRouteToPrecheck({
        contest: createContest({ examStatus: "in_progress", cheatDetectionEnabled: true }),
        precheckPassed: true,
      }),
    ).toBe(false);
  });

  it("computes submit-review back path", () => {
    // cheatDetection enabled + paused → precheck
    expect(
      getPaperSubmitReviewBackPath({
        contestId: "42",
        examStatus: "paused",
        cheatDetectionEnabled: true,
        precheckPassed: false,
      }),
    ).toBe("/contests/42/exam-precheck");
    // cheatDetection enabled + in_progress + precheck passed → answering
    expect(
      getPaperSubmitReviewBackPath({
        contestId: "42",
        examStatus: "in_progress",
        cheatDetectionEnabled: true,
        precheckPassed: true,
      }),
    ).toBe("/contests/42/paper-exam/answering");
    // cheatDetection disabled → always answering, even if precheckPassed is false
    expect(
      getPaperSubmitReviewBackPath({
        contestId: "42",
        examStatus: "in_progress",
        cheatDetectionEnabled: false,
        precheckPassed: false,
      }),
    ).toBe("/contests/42/paper-exam/answering");
  });

  it("checks whether current path stays under contest scope", () => {
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/42" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/42/" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/42/solve/p1" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/43" })).toBe(false);
  });
});
