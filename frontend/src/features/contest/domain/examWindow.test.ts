import { describe, expect, it } from "vitest";
import { isContestInExamWindow } from "./examWindow";

const contest = { startTime: "2026-11-03T09:00:00Z", endTime: "2026-11-03T10:00:00Z" };

describe("isContestInExamWindow", () => {
  it("is true between start and end, inclusive of end", () => {
    expect(isContestInExamWindow(contest, Date.parse("2026-11-03T09:30:00Z"))).toBe(true);
    expect(isContestInExamWindow(contest, Date.parse("2026-11-03T10:00:00Z"))).toBe(true);
  });

  it("is false before start and after end", () => {
    expect(isContestInExamWindow(contest, Date.parse("2026-11-03T08:59:59Z"))).toBe(false);
    expect(isContestInExamWindow(contest, Date.parse("2026-11-03T10:00:01Z"))).toBe(false);
  });

  it("is false for missing or invalid times", () => {
    expect(isContestInExamWindow({ startTime: "", endTime: "" }, Date.now())).toBe(false);
    expect(isContestInExamWindow(null, Date.now())).toBe(false);
  });
});
