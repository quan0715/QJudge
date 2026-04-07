import { describe, expect, it } from "vitest";
import type { BoundContest, ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import {
  buildAllTimelineDayGroups,
  buildTimelineDayGroups,
  pickHeroContest,
  contestBelongsOnActiveTimeline,
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

const baseAnnouncement = (overrides: Partial<ClassroomAnnouncement>): ClassroomAnnouncement => ({
  id: "a1",
  title: "Hello",
  content: "Body",
  isPinned: false,
  createdByUsername: "teacher",
  createdAt: "2026-06-16T08:00:00.000Z",
  updatedAt: "2026-06-16T08:00:00.000Z",
  ...overrides,
});

// ── Legacy tests (preserved) ──────────────────────────────────────────────────

describe("classroomActivityTimeline (legacy)", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("pickHeroContest chooses earliest future start", () => {
    const contests = [
      baseContest({
        contestId: "a",
        contestStartTime: "2026-06-18T10:00:00.000Z",
        contestEndTime: "2026-06-18T12:00:00.000Z",
      }),
      baseContest({
        contestId: "b",
        contestStartTime: "2026-06-16T10:00:00.000Z",
        contestEndTime: "2026-06-16T12:00:00.000Z",
      }),
    ];
    expect(pickHeroContest(contests, NOW)?.contestId).toBe("b");
  });

  it("pickHeroContest falls back to in-progress when no future", () => {
    const contests = [
      baseContest({
        contestId: "live",
        contestStartTime: "2026-06-14T10:00:00.000Z",
        contestEndTime: "2026-06-20T12:00:00.000Z",
      }),
    ];
    expect(pickHeroContest(contests, NOW)?.contestId).toBe("live");
  });

  it("pickHeroContest returns null when all ended", () => {
    const contests = [
      baseContest({
        contestId: "old",
        contestStartTime: "2026-06-01T10:00:00.000Z",
        contestEndTime: "2026-06-10T12:00:00.000Z",
      }),
    ];
    expect(pickHeroContest(contests, NOW)).toBeNull();
  });

  it("contestBelongsOnActiveTimeline excludes ended", () => {
    const ended = baseContest({
      contestStartTime: "2026-06-01T10:00:00.000Z",
      contestEndTime: "2026-06-10T12:00:00.000Z",
    });
    expect(contestBelongsOnActiveTimeline(ended, NOW)).toBe(false);
  });

  it("buildTimelineDayGroups groups same local day and sorts", () => {
    const contests = [
      baseContest({
        contestId: "late",
        contestStartTime: "2026-06-16T14:00:00.000Z",
        contestEndTime: "2026-06-16T15:00:00.000Z",
      }),
      baseContest({
        contestId: "early",
        contestStartTime: "2026-06-16T09:00:00.000Z",
        contestEndTime: "2026-06-16T10:00:00.000Z",
      }),
      baseContest({
        contestId: "old",
        contestStartTime: "2026-06-01T10:00:00.000Z",
        contestEndTime: "2026-06-10T12:00:00.000Z",
      }),
    ];
    const groups = buildTimelineDayGroups(contests, NOW);
    expect(groups.length).toBe(1);
    expect(groups[0].contests.map((c) => c.contestId)).toEqual(["early", "late"]);
  });
});

// ── buildAllTimelineDayGroups tests ───────────────────────────────────────────

describe("buildAllTimelineDayGroups", () => {
  // Use a fixed "now" at noon UTC on 2026-06-15 to avoid timezone edge cases in date keys.
  // The date key uses local time; we fix tests to UTC+0 by using noon so off-by-one is unlikely.
  const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();
  const TODAY_KEY = localDateKeyFromMs(NOW);

  it("includes past contests in groups", () => {
    const contests = [
      baseContest({
        contestId: "past",
        contestStartTime: "2026-06-01T10:00:00.000Z",
        contestEndTime: "2026-06-01T12:00:00.000Z",
      }),
      baseContest({
        contestId: "future",
        contestStartTime: "2026-06-20T10:00:00.000Z",
        contestEndTime: "2026-06-20T12:00:00.000Z",
      }),
    ];
    const groups = buildAllTimelineDayGroups(contests, [], NOW);
    const ids = groups.flatMap((g) =>
      g.events
        .filter((e) => e.type === "contest")
        .map((e) => (e as Extract<typeof e, { type: "contest" }>).contest.contestId),
    );
    expect(ids).toContain("past");
    expect(ids).toContain("future");
  });

  it("places announcement on createdAt date key", () => {
    const ann = baseAnnouncement({
      id: "ann1",
      createdAt: "2026-06-10T09:00:00.000Z",
    });
    const groups = buildAllTimelineDayGroups([], [ann], NOW);
    expect(groups.length).toBe(1);
    const event = groups[0].events[0];
    expect(event.type).toBe("announcement");
    if (event.type === "announcement") {
      expect(event.announcement.id).toBe("ann1");
    }
  });

  it("marks isToday correctly", () => {
    const todayContest = baseContest({
      contestId: "today-c",
      contestStartTime: new Date(NOW).toISOString(),
      contestEndTime: new Date(NOW + 3600000).toISOString(),
    });
    const pastContest = baseContest({
      contestId: "past-c",
      contestStartTime: "2026-06-01T10:00:00.000Z",
      contestEndTime: "2026-06-01T12:00:00.000Z",
    });
    const groups = buildAllTimelineDayGroups([todayContest, pastContest], [], NOW);
    const todayGroup = groups.find((g) => g.isToday);
    expect(todayGroup).toBeDefined();
    expect(todayGroup?.dateKey).toBe(TODAY_KEY);
    const otherGroups = groups.filter((g) => !g.isToday);
    for (const g of otherGroups) {
      expect(g.dateKey).not.toBe(TODAY_KEY);
    }
  });

  it("groups contest and announcement on same day together", () => {
    const contest = baseContest({
      contestId: "c",
      contestStartTime: "2026-06-10T10:00:00.000Z",
      contestEndTime: "2026-06-10T12:00:00.000Z",
    });
    const ann = baseAnnouncement({
      id: "a",
      createdAt: "2026-06-10T08:00:00.000Z",
    });
    const groups = buildAllTimelineDayGroups([contest], [ann], NOW);
    expect(groups.length).toBe(1);
    expect(groups[0].events.length).toBe(2);
    // announcement comes first (earlier sortMs)
    expect(groups[0].events[0].type).toBe("announcement");
    expect(groups[0].events[1].type).toBe("contest");
  });

  it("sorts groups chronologically", () => {
    const contests = [
      baseContest({ contestId: "later", contestStartTime: "2026-06-20T10:00:00.000Z", contestEndTime: "2026-06-20T11:00:00.000Z" }),
      baseContest({ contestId: "earlier", contestStartTime: "2026-06-05T10:00:00.000Z", contestEndTime: "2026-06-05T11:00:00.000Z" }),
    ];
    const groups = buildAllTimelineDayGroups(contests, [], NOW);
    const ids = groups.flatMap((g) =>
      g.events
        .filter((e) => e.type === "contest")
        .map((e) => (e as Extract<typeof e, { type: "contest" }>).contest.contestId),
    );
    expect(ids[0]).toBe("earlier");
    expect(ids[1]).toBe("later");
  });

  it("returns empty array when no events", () => {
    const groups = buildAllTimelineDayGroups([], [], NOW);
    expect(groups).toEqual([]);
  });
});
