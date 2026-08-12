import { beforeEach, describe, expect, it, vi } from "vitest";

import { exitFullscreen, requestFullscreen } from "./fullscreen";

describe("browser fullscreen adapter", () => {
  beforeEach(() => {
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
  });

  it("requests fullscreen via the standard API", async () => {
    let fullscreenActive = false;
    const requestFullscreenMock = vi.fn().mockImplementation(async () => {
      fullscreenActive = true;
    });
    Object.defineProperty(document, "fullscreenElement", {
      get: () => (fullscreenActive ? document.documentElement : null),
      configurable: true,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: requestFullscreenMock,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, "webkitRequestFullscreen", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, "msRequestFullscreen", {
      value: undefined,
      configurable: true,
    });

    expect(await requestFullscreen()).toBe(true);
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when the fullscreen request throws", async () => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: vi.fn().mockRejectedValue(new Error("denied")),
      configurable: true,
    });

    expect(await requestFullscreen()).toBe(false);
  });

  it("returns false when the fullscreen API is unavailable", async () => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, "webkitRequestFullscreen", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, "msRequestFullscreen", {
      value: undefined,
      configurable: true,
    });

    expect(await requestFullscreen()).toBe(false);
  });

  it("returns true when fullscreen is already inactive", async () => {
    expect(await exitFullscreen()).toBe(true);
  });

  it("exits fullscreen through the standard API", async () => {
    let fullscreenActive = true;
    const exitMock = vi.fn().mockImplementation(async () => {
      fullscreenActive = false;
    });
    Object.defineProperty(document, "fullscreenElement", {
      get: () => (fullscreenActive ? document.documentElement : null),
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: exitMock,
      configurable: true,
    });

    expect(await exitFullscreen()).toBe(true);
    expect(exitMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when the fullscreen exit throws", async () => {
    Object.defineProperty(document, "fullscreenElement", {
      get: () => document.documentElement,
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: vi.fn().mockRejectedValue(new Error("failed")),
      configurable: true,
    });

    expect(await exitFullscreen()).toBe(false);
  });
});
