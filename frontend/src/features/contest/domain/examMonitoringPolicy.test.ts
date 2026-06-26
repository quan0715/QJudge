import { describe, expect, it } from "vitest";

import {
  applyExamMonitoringPolicyOverrides,
  getTimingConfig,
} from "./examMonitoringPolicy";

describe("examMonitoringPolicy", () => {
  it("does not keep a frontend-only 30 second screen share recovery fallback", () => {
    const timing = getTimingConfig();

    expect(timing.screenShareRecoveryGraceMs).toBe(timing.recoveryGraceMs);
  });

  it("accepts backend-provided screen share recovery grace", () => {
    applyExamMonitoringPolicyOverrides({
      screenShareRecoveryGraceMs: 30_000,
    });

    expect(getTimingConfig().screenShareRecoveryGraceMs).toBe(30_000);
  });
});
