import { describe, expect, it } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  hasStartedExam,
  isContestParticipant,
  isExamMonitoringActive,
  isStrictSubmittedBeforeEnd,
  shouldLockContestWorkspaceNavigation,
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
    resultsPublished: false,
    examQuestionsCount: 0,
    isExamMonitored: false,
    requiresFullscreen: false,
    canSubmitExam: false,
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

const createMonitoredInProgressExam = (overrides: Partial<ContestDetail> = {}) =>
  createContest({
    contestType: "paper_exam",
    examStatus: "in_progress",
    cheatDetectionEnabled: true,
    isExamMonitored: true,
    requiresFullscreen: true,
    canSubmitExam: true,
    ...overrides,
  });

const createMonitoredLockedExam = (overrides: Partial<ContestDetail> = {}) =>
  createMonitoredInProgressExam({
    examStatus: "locked",
    ...overrides,
  });

const createSubmittedExam = (overrides: Partial<ContestDetail> = {}) =>
  createMonitoredInProgressExam({
    examStatus: "submitted",
    ...overrides,
  });

const createUnmonitoredExam = (overrides: Partial<ContestDetail> = {}) =>
  createContest({
    contestType: "paper_exam",
    examStatus: "in_progress",
    cheatDetectionEnabled: false,
    isExamMonitored: false,
    requiresFullscreen: false,
    canSubmitExam: true,
    ...overrides,
  });

describe("contestRuntimePolicy", () => {
  it("recognizes contest participation", () => {
    expect(isContestParticipant(createContest({ hasJoined: false, isRegistered: false }))).toBe(false);
    expect(isContestParticipant(createContest({ hasJoined: true, isRegistered: false }))).toBe(true);
    expect(isContestParticipant(createContest({ hasJoined: false, isRegistered: true }))).toBe(false);
  });

  it("treats submitted/locked/paused/in_progress as started exam", () => {
    expect(hasStartedExam(createContest({ hasStarted: true, examStatus: "not_started" }))).toBe(false);
    expect(hasStartedExam(createContest({ hasStarted: false, examStatus: "submitted" }))).toBe(true);
    expect(hasStartedExam(createContest({ hasStarted: false, examStatus: "paused" }))).toBe(true);
    expect(hasStartedExam(createContest({ hasStarted: false, examStatus: "locked" }))).toBe(true);
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
    expect(
      canAccessExamContent(
        createContest({ hasJoined: true, isRegistered: true, examStatus: "paused" }),
      ),
    ).toBe(false);
    expect(
      canAccessExamContent(
        createContest({ hasJoined: true, isRegistered: true, examStatus: "locked" }),
      ),
    ).toBe(false);
  });

  it("locks workspace navigation only while a joined exam is actively running", () => {
    expect(
      shouldLockContestWorkspaceNavigation(
        createContest({ hasJoined: true, examStatus: "in_progress" }),
      ),
    ).toBe(true);
    expect(
      shouldLockContestWorkspaceNavigation(
        createContest({ hasJoined: true, examStatus: "paused" }),
      ),
    ).toBe(true);
    expect(
      shouldLockContestWorkspaceNavigation(
        createContest({ hasJoined: true, examStatus: "locked" }),
      ),
    ).toBe(true);
    expect(
      shouldLockContestWorkspaceNavigation(
        createContest({ hasJoined: false, examStatus: "in_progress" }),
      ),
    ).toBe(false);
    expect(
      shouldLockContestWorkspaceNavigation(
        createContest({ hasJoined: true, examStatus: "submitted" }),
      ),
    ).toBe(false);
  });

  it("blocks strict submitted contests before end time", () => {
    const nowMs = Date.parse("2026-03-16T10:00:00.000Z");
    const strictSubmitted = createContest({
      cheatDetectionEnabled: true,
      examStatus: "submitted",
      endTime: "2026-03-16T10:30:00.000Z",
    });
    const strictSubmittedEnded = createContest({
      cheatDetectionEnabled: true,
      examStatus: "submitted",
      endTime: "2026-03-16T09:30:00.000Z",
    });
    const nonStrictSubmitted = createContest({
      cheatDetectionEnabled: false,
      examStatus: "submitted",
      endTime: "2026-03-16T10:30:00.000Z",
    });

    expect(isStrictSubmittedBeforeEnd(strictSubmitted, nowMs)).toBe(true);
    expect(canAccessExamContent(strictSubmitted, nowMs)).toBe(false);
    expect(isStrictSubmittedBeforeEnd(strictSubmittedEnded, nowMs)).toBe(false);
    expect(canAccessExamContent(strictSubmittedEnded, nowMs)).toBe(true);
    expect(isStrictSubmittedBeforeEnd(nonStrictSubmitted, nowMs)).toBe(false);
    expect(canAccessExamContent(nonStrictSubmitted, nowMs)).toBe(true);
  });

  it("fails closed for strict submitted contests with invalid endTime", () => {
    const nowMs = Date.parse("2026-03-16T10:00:00.000Z");
    const strictSubmittedInvalidEnd = createContest({
      cheatDetectionEnabled: true,
      examStatus: "submitted",
      endTime: "not-a-date",
    });

    expect(isStrictSubmittedBeforeEnd(strictSubmittedInvalidEnd, nowMs)).toBe(true);
    expect(canAccessExamContent(strictSubmittedInvalidEnd, nowMs)).toBe(false);
  });

  it("computes monitoring and exit warning flags", () => {
    const inProgress = createMonitoredInProgressExam();
    expect(isExamMonitoringActive(inProgress)).toBe(true);
    expect(isExamMonitoringActive(createMonitoredInProgressExam({ examStatus: "paused" }))).toBe(true);
    expect(isExamMonitoringActive(createMonitoredLockedExam())).toBe(true);
    expect(shouldWarnOnExit(inProgress, false)).toBe(true);
    expect(shouldForceEndExamOnExit(inProgress, false)).toBe(true);

    expect(shouldWarnOnExit(createSubmittedExam(), false)).toBe(false);
    expect(shouldWarnOnExit(createUnmonitoredExam(), false)).toBe(false);
    expect(shouldWarnOnExit(createMonitoredInProgressExam({ status: "draft" }), false)).toBe(false);
    expect(shouldWarnOnExit(createContest({ examStatus: "in_progress" }), true)).toBe(false);
  });
});
