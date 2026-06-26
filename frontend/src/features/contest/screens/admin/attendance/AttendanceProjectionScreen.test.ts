import { describe, expect, it } from "vitest";

import {
  getProjectionTokenRefreshDelayMs,
  type ProjectionTokenState,
} from "./lib/projectionTokenRefresh";

function token(expiresAt: string, refreshAfterSeconds = 60) {
  return {
    purpose: "check_in",
    token: "token",
    manualCode: "123456",
    qrValue: "qj-att:v1:check_in:token",
    refreshAfterSeconds,
    expiresInSeconds: refreshAfterSeconds,
    expiresAt,
  } satisfies NonNullable<ProjectionTokenState["check_in"]>;
}

describe("getProjectionTokenRefreshDelayMs", () => {
  it("uses the server refresh interval when the token has enough lifetime left", () => {
    const now = Date.parse("2026-06-10T02:04:00.000Z");
    const tokens: ProjectionTokenState = {
      check_in: token("2026-06-10T02:06:00.000Z"),
    };

    expect(getProjectionTokenRefreshDelayMs(tokens, now)).toBe(60_000);
  });

  it("refreshes at the earliest token expiry when an active credential is reused late", () => {
    const now = Date.parse("2026-06-10T02:04:55.000Z");
    const tokens: ProjectionTokenState = {
      check_in: token("2026-06-10T02:05:00.000Z"),
      check_out: {
        ...token("2026-06-10T02:05:10.000Z"),
        purpose: "check_out",
      },
    };

    expect(getProjectionTokenRefreshDelayMs(tokens, now)).toBe(5_000);
  });

  it("keeps a minimum retry delay for already-expired tokens", () => {
    const now = Date.parse("2026-06-10T02:05:01.000Z");
    const tokens: ProjectionTokenState = {
      check_in: token("2026-06-10T02:05:00.000Z"),
    };

    expect(getProjectionTokenRefreshDelayMs(tokens, now)).toBe(1_000);
  });
});
