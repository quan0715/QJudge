import { describe, expect, it } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { getAvailableContestTabKeys } from "./tabConfig";

const createContest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
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
  } as ContestDetail);

describe("getAvailableContestTabKeys", () => {
  it("returns overview when contest is missing", () => {
    expect(getAvailableContestTabKeys(null)).toEqual(["overview"]);
  });

  it("hides problems/clarifications before student starts exam", () => {
    const contest = createContest({
      hasStarted: false,
      examStatus: "not_started",
      currentUserRole: "student",
    });

    expect(getAvailableContestTabKeys(contest)).toEqual(["overview", "submissions"]);
  });

  it("shows problems/clarifications after student starts exam", () => {
    const contest = createContest({
      hasStarted: true,
      examStatus: "in_progress",
      currentUserRole: "student",
    });

    expect(getAvailableContestTabKeys(contest)).toEqual([
      "overview",
      "problems",
      "submissions",
      "clarifications",
    ]);
  });

  it("does not bypass problems/clarifications for contest managers before start", () => {
    const contest = createContest({
      hasStarted: false,
      examStatus: "not_started",
      currentUserRole: "teacher",
      permissions: {
        canSwitchView: true,
        canEditContest: true,
        canToggleStatus: true,
        canDeleteContest: true,
        canPublishProblems: true,
        canViewAllSubmissions: true,
        canViewFullScoreboard: true,
        canManageClarifications: true,
      },
    });

    expect(getAvailableContestTabKeys(contest)).toEqual([
      "overview",
      "submissions",
      "standings",
    ]);
  });

  it("never shows submissions tab for paper exam before start", () => {
    const contest = createContest({
      contestType: "paper_exam",
      hasStarted: false,
      examStatus: "not_started",
      currentUserRole: "student",
    });

    expect(getAvailableContestTabKeys(contest)).toEqual(["overview"]);
  });

  it("never shows submissions tab for paper exam after start", () => {
    const contest = createContest({
      contestType: "paper_exam",
      hasStarted: true,
      examStatus: "in_progress",
      currentUserRole: "student",
    });

    expect(getAvailableContestTabKeys(contest)).toEqual([
      "overview",
      "problems",
      "clarifications",
    ]);
  });
});
