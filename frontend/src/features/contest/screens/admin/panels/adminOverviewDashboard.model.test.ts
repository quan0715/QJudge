import { describe, expect, it } from "vitest";
import type {
  ContestDetail,
  ContestOverviewMetrics,
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";
import {
  buildAdminOverviewDashboard,
  buildAdminPreparationOverview,
  getTeacherAttentionRows,
} from "./adminOverviewDashboard.model";

const contest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
  ({
    id: "contest-1",
    name: "演算法期中考",
    description: "",
    startTime: "2026-05-03T09:00:00+08:00",
    endTime: "2026-05-03T11:00:00+08:00",
    status: "published",
    attendanceCheckEnabled: true,
    hasJoined: false,
    isRegistered: false,
    participantCount: 5,
    contestType: "coding",
    cheatDetectionEnabled: true,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    resultsPublished: false,
    examQuestionsCount: 0,
    isExamMonitored: true,
    requiresFullscreen: true,
    canSubmitExam: true,
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
    problems: [
      { id: "p1", problemId: "101", label: "A", title: "A", score: 100 },
      { id: "p2", problemId: "102", label: "B", title: "B", score: 100 },
    ],
    ...overrides,
  }) as ContestDetail;

const participant = (
  userId: string,
  examStatus: ContestParticipant["examStatus"],
  overrides: Partial<ContestParticipant> = {},
): ContestParticipant =>
  ({
    userId,
    username: `student-${userId}`,
    displayName: `學生 ${userId}`,
    accountRole: "student",
    connectionStatus: "online",
    score: 0,
    joinedAt: "2026-05-03T08:50:00+08:00",
    examStatus,
    violationCount: 0,
    ...overrides,
  }) as ContestParticipant;

const metrics: ContestOverviewMetrics = {
  onlineNow: 4,
  onlineActiveSessions: 3,
  exam: { status: "running", contestType: "coding" },
  timeProgress: {
    totalSeconds: 7200,
    elapsedSeconds: 2700,
    remainingSeconds: 4500,
    progressPercent: 37.5,
    isStarted: true,
    isEnded: false,
  },
};

describe("adminOverviewDashboard.model", () => {
  it("builds teacher KPIs without monitoring source details", () => {
    const data = buildAdminOverviewDashboard({
      contest: contest(),
      participants: [
        participant("1", "in_progress"),
        participant("2", "submitted"),
        participant("3", "locked", { violationCount: 2 }),
        participant("4", "not_started"),
      ],
      examEvents: [
        {
          id: "event-p0",
          userId: "1",
          userName: "學生 1",
          eventType: "connectivity_timeout",
          priority: 0,
          category: "connectivity",
          penalized: false,
          timestamp: "2026-05-03T10:05:00+08:00",
        } as ExamEvent,
        {
          id: "event-p1",
          userId: "2",
          userName: "學生 2",
          eventType: "mouse_leave",
          priority: 1,
          category: "focus",
          penalized: false,
          timestamp: "2026-05-03T10:10:00+08:00",
        } as ExamEvent,
        {
          id: "event-p2",
          userId: "3",
          userName: "學生 3",
          eventType: "mouse_leave_triggered",
          priority: 2,
          category: "focus",
          penalized: true,
          timestamp: "2026-05-03T10:12:00+08:00",
        } as ExamEvent,
      ],
      overviewMetrics: metrics,
      gradingStats: { totalAnswers: 10, gradedAnswers: 8 } as any,
      now: new Date("2026-05-03T10:15:00+08:00"),
    });

    expect(data.kpis.map((item) => item.key)).toEqual([
      "online",
      "started",
      "submitted",
      "locked",
      "attention",
    ]);
    expect(data.kpis.find((item) => item.key === "online")?.value).toBe(
      "4 / 5",
    );
    expect(data.timeline.phaseLabel).toBe("進行中");
    expect(data.timeline.primaryTimeLabel).toBe("剩餘 45:00");
    expect(data.timeline.startDateTimeLabel).toBe("09:00");
    expect(data.timeline.endDateTimeLabel).toBe("11:00");
    expect(data.timeline.progressPercent).toBe(37.5);
    expect(data.railItems.map((item) => item.key)).toEqual([
      "online",
      "in_progress",
      "not_started",
      "submitted",
      "locked_offline",
    ]);
    expect(data.insightCards.map((item) => item.key)).toEqual([
      "grading_progress",
      "exam_progress",
      "priority_events",
    ]);
    expect(
      data.insightCards.find((item) => item.key === "priority_events")?.value,
    ).toBe("3");
    expect(
      data.insightCards
        .find((item) => item.key === "priority_events")
        ?.series.map((item) => item.label),
    ).toEqual(["P0", "P1", "P2"]);
    expect(data.distribution.map((item) => item.key)).toEqual([
      "in_progress",
      "not_started",
      "submitted",
      "locked",
      "offline",
    ]);
    expect(JSON.stringify(data)).not.toContain("screen_share");
    expect(JSON.stringify(data)).not.toContain("webcam");
  });

  it("keeps paper exams generic and does not expose submission trends", () => {
    const data = buildAdminOverviewDashboard({
      contest: contest({
        contestType: "paper_exam",
        examQuestionsCount: 12,
        problems: [],
      }),
      participants: [participant("1", "submitted")],
      examEvents: [],
      overviewMetrics: {
        ...metrics,
        exam: { status: "running", contestType: "paper_exam" },
      },
      gradingStats: { totalAnswers: 12, gradedAnswers: 6 } as any,
      now: new Date("2026-05-03T10:15:00+08:00"),
    });

    expect(data.examStatus.workItemLabel).toBe("考卷題目");
    expect(data.examStatus.workItemCount).toBe(12);
    expect(JSON.stringify(data)).not.toMatch(/submission|提交趨勢|提交/);
  });

  it("prioritizes locked, violation, offline, and not-started students", () => {
    const events: ExamEvent[] = [
      {
        id: "event-1",
        userId: "2",
        userName: "學生 2",
        eventType: "multiple_displays",
        priority: 1,
        category: "display",
        penalized: false,
        timestamp: "2026-05-03T10:10:00+08:00",
      } as ExamEvent,
    ];

    const rows = getTeacherAttentionRows({
      participants: [
        participant("1", "locked", {
          lockedAt: "2026-05-03T10:09:00+08:00",
        }),
        participant("2", "in_progress", { violationCount: 1 }),
        participant("3", "in_progress", { connectionStatus: "offline" }),
        participant("4", "not_started"),
      ],
      examEvents: events,
      limit: 4,
    });

    expect(rows.map((row) => row.kind)).toEqual([
      "locked",
      "violation",
      "offline",
      "not_started",
    ]);
  });
});

describe("buildAdminPreparationOverview", () => {
  const build = (
    contestOverrides: Partial<ContestDetail> = {},
    participants: ContestParticipant[] = [participant("u1", "not_started")],
  ) =>
    buildAdminPreparationOverview({
      contest: contest({
        status: "draft",
        startTime: "",
        endTime: "",
        ...contestOverrides,
      }),
      participants,
      nowMs: Date.parse("2026-09-07T00:00:00Z"),
    });

  const scheduled = {
    startTime: "2026-09-08T01:00:00Z",
    endTime: "2026-09-08T03:00:00Z",
  };

  it("blocks publishing when the schedule is missing", () => {
    const data = build();

    expect(
      data.checklist.find((item) => item.key === "schedule")?.level,
    ).toBe("blocking");
    expect(data.blockingKeys).toEqual(["schedule"]);
    expect(data.canPublish).toBe(false);
  });

  it("warns but still allows publishing when there are no problems", () => {
    const data = build({ ...scheduled, problems: [] });

    expect(
      data.checklist.find((item) => item.key === "problems")?.level,
    ).toBe("warning");
    expect(data.blockingKeys).toEqual([]);
    expect(data.canPublish).toBe(true);
  });

  it("sorts blocking items above warnings and warnings above done", () => {
    const data = build({ rules: "  " });

    expect(data.checklist.map((item) => item.key)).toEqual([
      "schedule",
      "rules",
      "problems",
    ]);
    expect(data.checklist.map((item) => item.level)).toEqual([
      "blocking",
      "warning",
      "done",
    ]);
  });

  it("marks every item done when the contest is fully prepared", () => {
    const data = build({ ...scheduled, rules: "禁止攜帶手機" });

    expect(data.checklist.every((item) => item.level === "done")).toBe(true);
    expect(data.canPublish).toBe(true);
  });

  it("reports the upcoming phase and a countdown once published", () => {
    const data = build({
      status: "published",
      startTime: "2026-09-07T02:00:00Z",
      endTime: "2026-09-07T04:00:00Z",
      rules: "禁止攜帶手機",
    });

    expect(data.phase).toBe("upcoming");
    expect(data.countdownMs).toBe(2 * 60 * 60 * 1000);
  });

  it("counts paper exam questions instead of coding problems", () => {
    const data = build({
      contestType: "paper_exam",
      problems: [],
      examQuestionsCount: 5,
    });

    expect(
      data.checklist.find((item) => item.key === "problems")?.level,
    ).toBe("done");
  });

  it("excludes non-student participants from the roster", () => {
    const data = build({}, [
      participant("u1", "not_started"),
      participant("u2", "not_started", { accountRole: "teacher" }),
    ]);

    expect(data.participants.map((row) => row.userId)).toEqual(["u1"]);
  });
});
