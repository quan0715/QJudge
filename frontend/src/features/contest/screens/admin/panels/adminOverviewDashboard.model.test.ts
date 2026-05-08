import { describe, expect, it } from "vitest";
import type {
  ContestDetail,
  ContestOverviewMetrics,
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";
import {
  buildAdminOverviewDashboard,
  buildAdminPreparationDashboard,
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
    visibility: "private",
    attendanceCheckEnabled: true,
    hasJoined: false,
    isRegistered: false,
    participantCount: 5,
    contestType: "coding",
    deliveryMode: "exam",
    countsTowardGrade: true,
    cheatDetectionEnabled: true,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
    allowAutoUnlock: false,
    autoUnlockMinutes: 0,
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
          eventType: "heartbeat_timeout",
          timestamp: "2026-05-03T10:05:00+08:00",
        } as ExamEvent,
        {
          id: "event-p1",
          userId: "2",
          userName: "學生 2",
          eventType: "mouse_leave",
          timestamp: "2026-05-03T10:10:00+08:00",
        } as ExamEvent,
        {
          id: "event-p2",
          userId: "3",
          userName: "學生 3",
          eventType: "mouse_leave_triggered",
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

  it("builds a preparation dashboard for non-exam-time management", () => {
    const data = buildAdminPreparationDashboard({
      contest: contest({
        contestType: "paper_exam",
        examQuestionsCount: 12,
        problems: [],
        rules: "",
      }),
      participants: [
        participant("1", "submitted"),
        participant("2", "submitted"),
        participant("3", "not_started"),
      ],
      gradingStats: {
        totalAnswers: 12,
        gradedAnswers: 8,
        ungradedAnswers: 4,
      } as any,
    });

    expect(data.summaryItems.map((item) => item.key)).toEqual([
      "status",
      "schedule",
      "work_items",
      "participants",
      "grading",
      "results",
    ]);
    expect(
      data.summaryItems.find((item) => item.key === "work_items")?.value,
    ).toBe("12");
    expect(
      data.checklistItems.find((item) => item.key === "rules")?.status,
    ).toBe("warning");
    expect(data.grading.progressPercent).toBe(67);
    expect(JSON.stringify(data)).not.toMatch(/監控來源|提交趨勢|submission/);
  });

  it("builds preparation timeline states before, during, and after the exam", () => {
    const base = {
      contest: contest(),
      participants: [],
      gradingStats: { totalAnswers: 0, gradedAnswers: 0 } as any,
    };

    const before = buildAdminPreparationDashboard({
      ...base,
      now: new Date("2026-05-03T08:00:00+08:00"),
    });
    const during = buildAdminPreparationDashboard({
      ...base,
      now: new Date("2026-05-03T10:00:00+08:00"),
    });
    const after = buildAdminPreparationDashboard({
      ...base,
      now: new Date("2026-05-03T12:00:00+08:00"),
    });

    expect(before.timeline.phaseLabel).toBe("尚未開始");
    expect(before.timeline.primaryTimeLabel).toBe("距離開始 1:00:00");
    expect(before.timeline.progressPercent).toBe(0);
    expect(during.timeline.phaseLabel).toBe("進行中");
    expect(during.timeline.primaryTimeLabel).toBe("剩餘 1:00:00");
    expect(during.timeline.startDateTimeLabel).toBe("09:00");
    expect(during.timeline.endDateTimeLabel).toBe("11:00");
    expect(during.timeline.progressPercent).toBe(50);
    expect(after.timeline.phaseLabel).toBe("已結束");
    expect(after.timeline.primaryTimeLabel).toBe("考試已結束");
    expect(after.timeline.progressPercent).toBe(100);
  });
});
