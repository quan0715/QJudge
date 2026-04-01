import { describe, expect, it } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  getContestAnsweringEntryPath,
  getContestDashboardPath,
  getContestDashboardPathForContext,
  getContestPrecheckPath,
  getContestPrecheckPathForContext,
  getContestSolveRootPath,
  getContestSolvePathForContext,
  getContestSolvePath,
  getFirstContestProblemId,
  getPostPrecheckPath,
  isPathWithinContest,
  shouldRedirectToOverviewOnStrictSubmitted,
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
    expect(getContestDashboardPathForContext("42", "classroom-1")).toBe(
      "/classrooms/classroom-1/contest/42",
    );
    expect(getContestPrecheckPath("42")).toBe("/contests/42/exam-precheck");
    expect(getContestPrecheckPathForContext("42", "classroom-1")).toBe(
      "/classrooms/classroom-1/contest/42/exam-precheck",
    );
    expect(getContestSolvePath("42", "p1")).toBe("/contests/42/solve/p1");
    expect(getContestSolvePathForContext("42", "p1", "classroom-1")).toBe(
      "/classrooms/classroom-1/contest/42/solve/p1",
    );
    expect(getContestSolveRootPath("42", "q 1")).toBe(
      "/contests/42/solve?q=q%201",
    );
    expect(getContestSolveRootPath("42", "q 1", "classroom-1")).toBe(
      "/classrooms/classroom-1/contest/42/solve?q=q%201",
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

  it("routes paper contests to solve root after precheck", () => {
    const contest = createContest({ contestType: "paper_exam" });
    expect(getPostPrecheckPath("42", contest)).toBe("/contests/42/solve");
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

  it("checks whether current path stays under contest scope", () => {
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/42" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/42/" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/42/solve/p1" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/classrooms/1/contest/42" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/classrooms/1/contest/42/solve/p1" })).toBe(true);
    expect(isPathWithinContest({ contestId: "42", pathname: "/contests/43" })).toBe(false);
  });

  it("redirects strict submitted users to dashboard overview", () => {
    const nowMs = Date.parse("2026-03-16T10:00:00.000Z");
    const strictSubmitted = createContest({
      contestType: "paper_exam",
      cheatDetectionEnabled: true,
      examStatus: "submitted",
      endTime: "2026-03-16T11:00:00.000Z",
    });
    const strictSubmittedEnded = createContest({
      contestType: "paper_exam",
      cheatDetectionEnabled: true,
      examStatus: "submitted",
      endTime: "2026-03-16T09:00:00.000Z",
    });

    expect(
      shouldRedirectToOverviewOnStrictSubmitted({
        contestId: "42",
        contest: strictSubmitted,
        pathname: "/contests/42/solve/p1",
        search: "",
        nowMs,
      }),
    ).toBe(true);
    expect(
      shouldRedirectToOverviewOnStrictSubmitted({
        contestId: "42",
        contest: strictSubmitted,
        pathname: "/contests/42",
        search: "?tab=problems",
        nowMs,
      }),
    ).toBe(true);
    expect(
      shouldRedirectToOverviewOnStrictSubmitted({
        contestId: "42",
        contest: strictSubmitted,
        pathname: "/contests/42",
        search: "?tab=overview",
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldRedirectToOverviewOnStrictSubmitted({
        contestId: "42",
        contest: strictSubmittedEnded,
        pathname: "/contests/42/solve/p1",
        search: "",
        nowMs,
      }),
    ).toBe(false);
  });
});
