import { beforeEach, describe, expect, it, vi } from "vitest";

import { exitFullscreen, leaveExamUseCase } from "./leaveExam.usecase";

vi.mock("@/infrastructure/api/repositories", () => ({
  endExam: vi.fn(),
}));

import { endExam } from "@/infrastructure/api/repositories";

describe("leaveExam.usecase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
  });

  it("returns true when not in fullscreen", async () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });

    const result = await exitFullscreen();
    expect(result).toBe(true);
  });

  it("exits fullscreen when fullscreen element exists", async () => {
    const exitMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: exitMock,
      configurable: true,
    });

    const result = await exitFullscreen();
    expect(result).toBe(true);
    expect(exitMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when fullscreen exit throws", async () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: vi.fn().mockRejectedValue(new Error("failed")),
      configurable: true,
    });

    const result = await exitFullscreen();
    expect(result).toBe(false);
  });

  it("ends exam then navigates to contests", async () => {
    vi.mocked(endExam).mockResolvedValue(undefined as void);
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    });

    const result = await leaveExamUseCase({
      contestId: "contest-1",
      shouldEndExam: true,
    });

    expect(endExam).toHaveBeenCalledWith("contest-1");
    expect(result).toEqual({
      success: true,
      navigateTo: "/contests",
    });
  });

  it("still navigates when endExam fails", async () => {
    vi.mocked(endExam).mockRejectedValue(new Error("api down"));
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    });

    const result = await leaveExamUseCase({
      contestId: "contest-1",
      shouldEndExam: true,
    });

    expect(result).toEqual({
      success: false,
      navigateTo: "/contests",
      error: "api down",
    });
  });
});
