import { describe, expect, it } from "vitest";

import {
  deriveAttendanceStep,
  type DeriveAttendanceStepInput,
} from "./deriveAttendanceStep";

const base: DeriveAttendanceStepInput = {
  isDone: false,
  manualMode: false,
  hasScan: false,
  hasReviewPhoto: false,
  allPhotosCaptured: false,
};

const input = (overrides: Partial<DeriveAttendanceStepInput>) => ({
  ...base,
  ...overrides,
});

describe("deriveAttendanceStep", () => {
  it("done overrides every other flag", () => {
    expect(
      deriveAttendanceStep(
        input({
          isDone: true,
          manualMode: true,
          hasScan: true,
          hasReviewPhoto: true,
          allPhotosCaptured: true,
        }),
      ),
    ).toBe("done");
  });

  it("manual mode wins when not done", () => {
    expect(
      deriveAttendanceStep(input({ manualMode: true, hasScan: true })),
    ).toBe("manual");
  });

  it("no scan yet falls back to scan step", () => {
    expect(deriveAttendanceStep(input({}))).toBe("scan");
  });

  it("review photo wins over confirm/photo", () => {
    expect(
      deriveAttendanceStep(
        input({ hasScan: true, hasReviewPhoto: true, allPhotosCaptured: true }),
      ),
    ).toBe("photoReview");
  });

  it("all captured + scanned moves to confirm", () => {
    expect(
      deriveAttendanceStep(input({ hasScan: true, allPhotosCaptured: true })),
    ).toBe("confirm");
  });

  it("scanned but missing photos stays on photo step", () => {
    expect(deriveAttendanceStep(input({ hasScan: true }))).toBe("photo");
  });
});
