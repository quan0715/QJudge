import { describe, expect, it } from "vitest";

import {
  formatContestClockTime,
  formatContestCompactDuration,
  formatContestCountdownDuration,
  formatContestMonthDay,
  parseContestDate,
} from "./contestTimeFormat";

describe("contestTimeFormat", () => {
  it("parses valid contest date inputs and rejects invalid values", () => {
    expect(parseContestDate("2026-05-10T08:00:00.000Z")?.getTime()).toBe(
      Date.parse("2026-05-10T08:00:00.000Z"),
    );
    expect(parseContestDate(null)).toBeNull();
    expect(parseContestDate("not-a-date")).toBeNull();
  });

  it("formats fixed countdown duration as HH:MM:SS", () => {
    expect(formatContestCountdownDuration(0)).toBe("00:00:00");
    expect(formatContestCountdownDuration(3_723_000)).toBe("01:02:03");
    expect(formatContestCountdownDuration(-1)).toBe("00:00:00");
  });

  it("formats compact duration labels", () => {
    expect(formatContestCompactDuration(62_000)).toBe("1m 2s");
    expect(formatContestCompactDuration(3_723_000)).toBe("1h 2m 3s");
    expect(formatContestCompactDuration(90_061_000)).toBe("1d 1h 1m");
  });

  it("uses fallbacks for invalid clock and month-day values", () => {
    expect(formatContestClockTime(undefined, "zh-TW", { fallback: "--" })).toBe("--");
    expect(formatContestMonthDay("bad-date", "zh-TW", "--")).toBe("--");
  });
});
