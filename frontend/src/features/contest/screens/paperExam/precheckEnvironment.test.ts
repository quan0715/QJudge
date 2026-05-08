import { describe, expect, it } from "vitest";
import { createEligibilityChecks } from "./precheckEnvironment";

const t = (_key: string, fallback?: string) => fallback ?? _key;

describe("precheckEnvironment", () => {
  it("adds attendance eligibility check when QR attendance is required", () => {
    const checks = createEligibilityChecks(t as never, { requireAttendance: true });

    expect(checks.map((check) => check.id)).toEqual([
      "participation",
      "submitted",
      "attendance",
    ]);
  });

  it("omits attendance eligibility check when QR attendance is not required", () => {
    const checks = createEligibilityChecks(t as never);

    expect(checks.map((check) => check.id)).toEqual([
      "participation",
      "submitted",
    ]);
  });
});
