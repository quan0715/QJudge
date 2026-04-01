import { describe, expect, it } from "vitest";
import { getContestSettingsBackPath } from "./contestAdminPaths";

describe("getContestSettingsBackPath", () => {
  it("returns dashboard for legacy contests", () => {
    expect(getContestSettingsBackPath("contest-1")).toBe("/dashboard");
  });

  it("returns classroom dashboard for classroom-bound contests", () => {
    expect(getContestSettingsBackPath("contest-1", "classroom-1")).toBe(
      "/classrooms/classroom-1/contest/contest-1",
    );
  });
});
