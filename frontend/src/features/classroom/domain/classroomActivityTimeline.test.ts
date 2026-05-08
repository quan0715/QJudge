import { describe, expect, it } from "vitest";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  buildClassroomMonthSchedule,
  buildClassroomWeekSchedule,
  getUpcomingContestTasks,
  localDateKeyFromMs,
} from "./classroomActivityTimeline";

const baseContest = (overrides: Partial<BoundContest>): BoundContest => ({
  contestId: "c1",
  contestName: "Exam",
  contestDescription: "",
  contestStatus: "published",
  contestVisibility: "public",
  contestType: "coding",
  deliveryMode: "exam",
  contestStartTime: "2026-06-16T10:00:00.000Z",
  contestEndTime: "2026-06-16T12:00:00.000Z",
  contestOwnerUsername: "teacher",
  participantCount: 0,
  boundAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

// ── buildClassroomMonthSchedule tests ────────────────────────────────────────

describe("buildClassroomMonthSchedule", () => {
  const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();
  const TODAY_KEY = localDateKeyFromMs(NOW);

  it("builds a fixed six-week month grid", () => {
    const cells = buildClassroomMonthSchedule([], new Date(2026, 5, 15), NOW);

    expect(cells).toHaveLength(42);
    expect(cells[0].dateKey).toBe(
      localDateKeyFromMs(new Date(2026, 4, 31).getTime()),
    );
    expect(cells[41].dateKey).toBe(
      localDateKeyFromMs(new Date(2026, 6, 11).getTime()),
    );
  });

  it("excludes draft contests and keeps published/archived contest events", () => {
    const cells = buildClassroomMonthSchedule(
      [
        baseContest({
          contestId: "draft",
          contestStatus: "draft",
          contestStartTime: new Date(2026, 5, 16, 10).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 11).toISOString(),
        }),
        baseContest({
          contestId: "published",
          contestStatus: "published",
          contestStartTime: new Date(2026, 5, 16, 12).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 13).toISOString(),
        }),
        baseContest({
          contestId: "archived",
          contestStatus: "archived",
          contestStartTime: new Date(2026, 5, 17, 10).toISOString(),
          contestEndTime: new Date(2026, 5, 17, 11).toISOString(),
        }),
      ],
      new Date(2026, 5, 15),
      NOW,
    );

    const ids = cells.flatMap((cell) =>
      cell.events.map((event) => event.contest.contestId),
    );
    expect(ids).not.toContain("draft");
    expect(ids).toContain("published");
    expect(ids).toContain("archived");
  });

  it("sorts same-day events by start time", () => {
    const cells = buildClassroomMonthSchedule(
      [
        baseContest({
          contestId: "late",
          contestStartTime: new Date(2026, 5, 16, 14).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 15).toISOString(),
        }),
        baseContest({
          contestId: "early",
          contestStartTime: new Date(2026, 5, 16, 9).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 10).toISOString(),
        }),
      ],
      new Date(2026, 5, 15),
      NOW,
    );

    const dateKey = localDateKeyFromMs(new Date(2026, 5, 16, 10).getTime());
    const eventIds = cells
      .find((cell) => cell.dateKey === dateKey)
      ?.events.map((event) => event.contest.contestId);
    expect(eventIds).toEqual(["early", "late"]);
  });

  it("marks today and current-month cells", () => {
    const cells = buildClassroomMonthSchedule([], new Date(2026, 5, 15), NOW);
    const todayCell = cells.find((cell) => cell.isToday);

    expect(todayCell?.dateKey).toBe(TODAY_KEY);
    expect(todayCell?.isCurrentMonth).toBe(true);
    expect(cells[0].isCurrentMonth).toBe(false);
  });

  it("contains only contest event types", () => {
    const cells = buildClassroomMonthSchedule(
      [
        baseContest({
          contestId: "contest-only",
          contestStartTime: new Date(2026, 5, 16, 10).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 11).toISOString(),
        }),
      ],
      new Date(2026, 5, 15),
      NOW,
    );

    expect(
      cells.flatMap((cell) => cell.events.map((event) => event.type)),
    ).toEqual(["contest"]);
  });
});

describe("buildClassroomWeekSchedule", () => {
  const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();
  const TODAY_KEY = localDateKeyFromMs(NOW);

  it("builds a fixed seven-day week grid", () => {
    const cells = buildClassroomWeekSchedule([], new Date(2026, 5, 17), NOW);

    expect(cells).toHaveLength(7);
    expect(cells[0].dateKey).toBe(
      localDateKeyFromMs(new Date(2026, 5, 14).getTime()),
    );
    expect(cells[6].dateKey).toBe(
      localDateKeyFromMs(new Date(2026, 5, 20).getTime()),
    );
  });

  it("excludes draft contests and sorts same-day events", () => {
    const cells = buildClassroomWeekSchedule(
      [
        baseContest({
          contestId: "late",
          contestStartTime: new Date(2026, 5, 16, 14).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 15).toISOString(),
        }),
        baseContest({
          contestId: "draft",
          contestStatus: "draft",
          contestStartTime: new Date(2026, 5, 16, 8).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 9).toISOString(),
        }),
        baseContest({
          contestId: "early",
          contestStartTime: new Date(2026, 5, 16, 9).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 10).toISOString(),
        }),
      ],
      new Date(2026, 5, 17),
      NOW,
    );

    const dateKey = localDateKeyFromMs(new Date(2026, 5, 16, 10).getTime());
    const eventIds = cells
      .find((cell) => cell.dateKey === dateKey)
      ?.events.map((event) => event.contest.contestId);
    expect(eventIds).toEqual(["early", "late"]);
  });

  it("marks today and anchor-month cells", () => {
    const cells = buildClassroomWeekSchedule([], new Date(2026, 5, 17), NOW);
    const todayCell = cells.find((cell) => cell.isToday);

    expect(todayCell?.dateKey).toBe(TODAY_KEY);
    expect(todayCell?.isCurrentMonth).toBe(true);
  });
});

describe("getUpcomingContestTasks", () => {
  const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

  it("returns published non-ended contests sorted by start time", () => {
    const tasks = getUpcomingContestTasks(
      [
        baseContest({
          contestId: "ended",
          contestStartTime: new Date(2026, 5, 10, 10).toISOString(),
          contestEndTime: new Date(2026, 5, 10, 11).toISOString(),
        }),
        baseContest({
          contestId: "future-late",
          contestStartTime: new Date(2026, 5, 20, 10).toISOString(),
          contestEndTime: new Date(2026, 5, 20, 11).toISOString(),
        }),
        baseContest({
          contestId: "future-early",
          contestStartTime: new Date(2026, 5, 16, 10).toISOString(),
          contestEndTime: new Date(2026, 5, 16, 11).toISOString(),
        }),
        baseContest({
          contestId: "draft",
          contestStatus: "draft",
          contestStartTime: new Date(2026, 5, 15, 10).toISOString(),
          contestEndTime: new Date(2026, 5, 15, 13).toISOString(),
        }),
      ],
      NOW,
    );

    expect(tasks.map((contest) => contest.contestId)).toEqual([
      "future-early",
      "future-late",
    ]);
  });
});
