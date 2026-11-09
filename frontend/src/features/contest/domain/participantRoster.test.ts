import { describe, expect, it } from "vitest";
import type { ContestParticipant } from "@/core/entities/contest.entity";
import {
  filterParticipants,
  getAttentionScore,
  isParticipantLive,
  needsAttention,
  sortParticipantsByAttention,
  sortParticipantsByScore,
} from "./participantRoster";

const p = (overrides: Partial<ContestParticipant>): ContestParticipant => ({
  userId: "0",
  username: "student",
  displayName: "",
  score: 0,
  joinedAt: "2026-11-03T09:00:00Z",
  examStatus: "in_progress",
  violationCount: 0,
  connectionStatus: "online",
  liveMonitoringOnline: true,
  ...overrides,
});

describe("participantRoster", () => {
  it("treats live monitoring or live connection as live", () => {
    expect(isParticipantLive(p({ liveMonitoringOnline: false, connectionStatus: "live" }))).toBe(true);
    expect(isParticipantLive(p({ liveMonitoringOnline: false, connectionStatus: "online" }))).toBe(false);
  });

  it("flags violations and locked or paused students as needing attention", () => {
    expect(needsAttention(p({ violationCount: 1 }))).toBe(true);
    expect(needsAttention(p({ examStatus: "paused" }))).toBe(true);
    expect(needsAttention(p({ examStatus: "submitted" }))).toBe(false);
  });

  it("scores locked above violations", () => {
    expect(getAttentionScore(p({ examStatus: "locked" }))).toBeGreaterThan(
      getAttentionScore(p({ violationCount: 3 })),
    );
  });

  it("sorts locked first, then by violations, then by name", () => {
    const rows = [
      p({ userId: "1", displayName: "Ben" }),
      p({ userId: "2", examStatus: "locked" }),
      p({ userId: "3", violationCount: 2 }),
      p({ userId: "4", displayName: "Amy" }),
    ];
    expect(sortParticipantsByAttention(rows).map((row) => row.userId)).toEqual(["2", "3", "4", "1"]);
    expect(rows.map((row) => row.userId)).toEqual(["1", "2", "3", "4"]);
  });

  it("sorts by score high to low, then by name", () => {
    const rows = [
      p({ userId: "1", displayName: "Ben", score: 40 }),
      p({ userId: "2", displayName: "Cat", score: 90 }),
      p({ userId: "3", displayName: "Amy", score: 40 }),
    ];
    expect(sortParticipantsByScore(rows).map((row) => row.userId)).toEqual(["2", "3", "1"]);
  });

  it("filters the top and bottom quarter by score, keeping ties", () => {
    const rows = [10, 20, 30, 40, 50, 60, 70, 80].map((score) => p({ userId: String(score), score }));
    const ids = (score: "top" | "bottom" | "zero") =>
      filterParticipants(rows, { query: "", score }).map((row) => row.userId);
    expect(ids("top")).toEqual(["70", "80"]);
    expect(ids("bottom")).toEqual(["10", "20"]);
    rows.push(p({ userId: "tie", score: 70 }));
    expect(ids("top")).toEqual(["70", "80", "tie"]);
  });

  it("filters zero scores and matches lock reasons in the query", () => {
    const rows = [
      p({ userId: "1", score: 0, lockReason: "離開座位" }),
      p({ userId: "2", score: 5 }),
    ];
    expect(filterParticipants(rows, { query: "座位", score: "all" }).map((row) => row.userId)).toEqual(["1"]);
    expect(filterParticipants(rows, { query: "", score: "zero" }).map((row) => row.userId)).toEqual(["1"]);
  });
});
