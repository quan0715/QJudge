import { describe, expect, it } from "vitest";
import {
  choiceFromPolicy,
  policyFromChoice,
  redistributedScore,
} from "./scorePolicyChoice";
describe("score policy choices", () => {
  it("keeps the total when excluding", () => {
    expect(policyFromChoice("excluded_keep")).toEqual({
      policy: "redistribute",
      config: { redistribute_to: [] },
    });
    expect(choiceFromPolicy("redistribute")).toBe("excluded_keep");
  });
  it("lowers the total when excluding", () =>
    expect(policyFromChoice("excluded_lower")).toEqual({ policy: "excluded" }));
  it("scales a target score", () =>
    expect(redistributedScore(5, 85, 15)).toBe(5.88));
});
