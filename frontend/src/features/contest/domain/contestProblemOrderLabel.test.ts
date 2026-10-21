import { describe, expect, it } from "vitest";
import { labelForContestProblemOrder } from "./contestProblemOrderLabel";

describe("labelForContestProblemOrder", () => {
  it.each<[number, string]>([
    [0, "A"], [1, "B"], [25, "Z"], [26, "AA"], [27, "AB"],
    [51, "AZ"], [52, "BA"], [701, "ZZ"], [702, "AAA"],
  ])("labels order %i as %s", (order, expected) => {
    expect(labelForContestProblemOrder(order)).toBe(expected);
  });
});
