import { describe, expect, it } from "vitest";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  buildTimelineDayGroups,
  pickHeroContest,
  contestBelongsOnActiveTimeline,
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

describe("classroomActivityTimeline", () => {
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
