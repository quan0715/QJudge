import { describe, expect, it } from "vitest";
import {
  CONTEST_TAB_LABEL_KEY_MAP,
  toContestTabSpecs,
} from "./tabConfig";

describe("contest tab config", () => {
  it("maps every tab key to translation key", () => {
    expect(CONTEST_TAB_LABEL_KEY_MAP).toEqual({
      overview: "tabs.overview",
      problems: "tabs.problems",
      submissions: "tabs.submissions",
      standings: "tabs.ranking",
      clarifications: "tabs.clarifications",
    });
  });

  it("converts tab keys to tab specs", () => {
    expect(toContestTabSpecs(["overview", "problems"]))
      .toEqual([
        { key: "overview", labelKey: "tabs.overview" },
        { key: "problems", labelKey: "tabs.problems" },
      ]);
  });
});
