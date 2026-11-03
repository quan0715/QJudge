import { describe, expect, it } from "vitest";
import type { ContestParticipant } from "@/core/entities/contest.entity";
import {
  PARTICIPANT_STATUS_FILTERS,
  filterParticipants,
  getAttentionScore,
  isParticipantLive,
  needsAttention,
  sortParticipantsByAttention,
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

  it("filters needs_attention and query together", () => {
    const rows = [
      p({ userId: "1", violationCount: 1, username: "amy" }),
      p({ userId: "2", username: "amber" }),
      p({ userId: "3", violationCount: 1, username: "bob" }),
    ];
    expect(
      filterParticipants(rows, { query: "AM", status: "needs_attention" }).map((row) => row.userId),
    ).toEqual(["1"]);
  });

  it("filters by exam status and matches lock reasons", () => {
    const rows = [
      p({ userId: "1", examStatus: "locked", lockReason: "離開座位" }),
      p({ userId: "2", examStatus: "not_started" }),
    ];
    expect(filterParticipants(rows, { query: "座位", status: "all" }).map((row) => row.userId)).toEqual(["1"]);
    expect(filterParticipants(rows, { query: "", status: "not_started" }).map((row) => row.userId)).toEqual(["2"]);
  });

  it("offers a not_started status filter", () => {
    expect(PARTICIPANT_STATUS_FILTERS.map((option) => option.id)).toContain("not_started");
  });
});
