import { describe, expect, it } from "vitest";
import { getClassroomBackPath, getContestSettingsBackPath } from "./contestAdminPaths";

describe("getContestSettingsBackPath", () => {
  it("returns dashboard for legacy contests", () => {
    expect(getContestSettingsBackPath("contest-1")).toBe("/dashboard");
  });

  it("returns classroom dashboard for classroom-bound contests", () => {
    expect(getContestSettingsBackPath("contest-1", "classroom-1")).toBe(
      "/classrooms/classroom-1",
    );
  });
});

describe("getClassroomBackPath", () => {
  it("returns classroom root path when classroom id exists", () => {
    expect(getClassroomBackPath("classroom-1")).toBe("/classrooms/classroom-1");
  });

  it("returns dashboard when classroom id is missing", () => {
    expect(getClassroomBackPath()).toBe("/dashboard");
  });
});
