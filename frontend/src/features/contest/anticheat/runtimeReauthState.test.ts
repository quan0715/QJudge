import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginRuntimeScreenShareReauth,
  endRuntimeScreenShareReauth,
  isRuntimeScreenShareReauthActive,
} from "./runtimeReauthState";

describe("runtimeReauthState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T00:00:00Z"));
    endRuntimeScreenShareReauth(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is active during reauth", () => {
    beginRuntimeScreenShareReauth();
    expect(isRuntimeScreenShareReauthActive()).toBe(true);
  });

  it("keeps a short grace window after reauth", () => {
    beginRuntimeScreenShareReauth();
    endRuntimeScreenShareReauth(1000);

    expect(isRuntimeScreenShareReauthActive()).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(isRuntimeScreenShareReauthActive()).toBe(false);
  });
});

