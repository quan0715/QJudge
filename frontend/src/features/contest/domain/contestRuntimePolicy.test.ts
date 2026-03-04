import { describe, expect, it } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  hasStartedExam,
  isContestParticipant,
  isExamMonitoringActive,
  shouldForceEndExamOnExit,
  shouldWarnOnExit,
} from "./contestRuntimePolicy";

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
  }) as ContestDetail;

describe("contestRuntimePolicy", () => {
  it("recognizes contest participation", () => {
    expect(isContestParticipant(createContest({ hasJoined: false, isRegistered: false }))).toBe(false);
    expect(isContestParticipant(createContest({ hasJoined: true, isRegistered: false }))).toBe(true);
  });

  it("treats submitted/locked/paused/in_progress as started exam", () => {
    expect(hasStartedExam(createContest({ hasStarted: true, examStatus: "not_started" }))).toBe(true);
    expect(hasStartedExam(createContest({ hasStarted: false, examStatus: "submitted" }))).toBe(true);
    expect(hasStartedExam(createContest({ hasStarted: false, examStatus: "not_started" }))).toBe(false);
  });

  it("allows exam content only for participants after exam starts", () => {
    expect(
      canAccessExamContent(
        createContest({ hasJoined: false, isRegistered: false, examStatus: "submitted" }),
      ),
    ).toBe(false);
    expect(
      canAccessExamContent(
        createContest({ hasJoined: true, isRegistered: true, examStatus: "in_progress" }),
      ),
    ).toBe(true);
  });

  it("computes monitoring and exit warning flags", () => {
    const inProgress = createContest({ examStatus: "in_progress", cheatDetectionEnabled: true });
    expect(isExamMonitoringActive(inProgress)).toBe(true);
    expect(shouldWarnOnExit(inProgress, false)).toBe(true);
    expect(shouldForceEndExamOnExit(inProgress, false)).toBe(true);

    expect(shouldWarnOnExit(createContest({ examStatus: "submitted" }), false)).toBe(false);
    expect(shouldWarnOnExit(createContest({ examStatus: "in_progress", status: "draft" }), false)).toBe(false);
    expect(shouldWarnOnExit(createContest({ examStatus: "in_progress" }), true)).toBe(false);
  });
});
