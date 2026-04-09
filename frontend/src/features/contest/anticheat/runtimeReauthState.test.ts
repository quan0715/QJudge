import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginRuntimeScreenShareReauth,
  endRuntimeScreenShareReauth,
  clearRuntimeScreenShareReauth,
  isRuntimeScreenShareReauthActive,
} from "./runtimeReauthState";

describe("runtimeReauthState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T00:00:00Z"));
    clearRuntimeScreenShareReauth();
  });

  afterEach(() => {
    clearRuntimeScreenShareReauth();
    vi.useRealTimers();
  });

  it("is active during reauth", () => {
    beginRuntimeScreenShareReauth();
    expect(isRuntimeScreenShareReauthActive()).toBe(true);
  });

  it("keeps a short grace window after reauth ends", () => {
    beginRuntimeScreenShareReauth();
    endRuntimeScreenShareReauth(1000);

    expect(isRuntimeScreenShareReauthActive()).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(isRuntimeScreenShareReauthActive()).toBe(false);
  });

  it("contestId isolation: contest A reauth does not affect contest B", () => {
    beginRuntimeScreenShareReauth("contest-A", 5000);
    expect(isRuntimeScreenShareReauthActive("contest-A")).toBe(true);
    expect(isRuntimeScreenShareReauthActive("contest-B")).toBe(false);
  });

  it("clearRuntimeScreenShareReauth makes it inactive", () => {
    beginRuntimeScreenShareReauth("contest-1", 10000);
    expect(isRuntimeScreenShareReauthActive("contest-1")).toBe(true);

    clearRuntimeScreenShareReauth("contest-1");
    expect(isRuntimeScreenShareReauthActive("contest-1")).toBe(false);
  });

  it("endRuntimeScreenShareReauth with 0 grace becomes inactive immediately", () => {
    beginRuntimeScreenShareReauth("contest-1", 5000);
    endRuntimeScreenShareReauth("contest-1", 0);

    expect(isRuntimeScreenShareReauthActive("contest-1")).toBe(false);
  });

  it("global check returns true if any contest is active", () => {
    beginRuntimeScreenShareReauth("contest-A", 5000);

    expect(isRuntimeScreenShareReauthActive()).toBe(true);
  });
});

