import { describe, expect, it } from "vitest";

import {
  isIntegrityAttemptActive,
  requiresAnticheatPolicyConfig,
} from "./ExamModeWrapper";

describe("requiresAnticheatPolicyConfig", () => {
  it("keeps integrity configuration available for an enabled contest even while the displayed attempt is submitted", () => {
    expect(requiresAnticheatPolicyConfig(true)).toBe(true);
  });

  it("does not load integrity configuration when anti-cheat is disabled", () => {
    expect(requiresAnticheatPolicyConfig(false)).toBe(false);
  });

  it("starts transport only for an active attempt, not a submitted rejoin candidate", () => {
    expect(isIntegrityAttemptActive("in_progress")).toBe(true);
    expect(isIntegrityAttemptActive("paused")).toBe(true);
    expect(isIntegrityAttemptActive("locked")).toBe(true);
    expect(isIntegrityAttemptActive("submitted")).toBe(false);
  });
});
