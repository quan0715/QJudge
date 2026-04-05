import { describe, expect, it } from "vitest";
import { labelForContestProblemOrder } from "./contestProblemOrderLabel";

describe("labelForContestProblemOrder", () => {
  it("uses A–Z for order 0–25", () => {
    expect(labelForContestProblemOrder(0)).toBe("A");
    expect(labelForContestProblemOrder(1)).toBe("B");
    expect(labelForContestProblemOrder(25)).toBe("Z");
  });

  it("uses P27 style after Z", () => {
    expect(labelForContestProblemOrder(26)).toBe("P27");
  });
});
