import { beforeEach, describe, expect, it, vi } from "vitest";

import { enterExamUseCase, requestFullscreen } from "./enterExam.usecase";

vi.mock("@/infrastructure/api/repositories", () => ({
  startExam: vi.fn(),
}));

import { startExam } from "@/infrastructure/api/repositories";

describe("enterExam.usecase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requests fullscreen via standard API", async () => {
    const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
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

    const result = await requestFullscreen();
    expect(result).toBe(true);
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when fullscreen request throws", async () => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: vi.fn().mockRejectedValue(new Error("denied")),
      configurable: true,
    });

    const result = await requestFullscreen();
    expect(result).toBe(false);
  });

  it("starts exam and navigates on started status", async () => {
    vi.mocked(startExam).mockResolvedValue({ status: "started" } as any);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    });

    const result = await enterExamUseCase({
      contestId: "contest-1",
      examModeEnabled: true,
    });

    expect(startExam).toHaveBeenCalledWith("contest-1");
    expect(result).toEqual({
      success: true,
      status: "started",
      navigateTo: "/contests/contest-1/problems",
    });
  });

  it("handles unexpected startExam response", async () => {
    vi.mocked(startExam).mockResolvedValue({ error: "cannot start" } as any);

    const result = await enterExamUseCase({
      contestId: "contest-1",
      examModeEnabled: false,
    });

    expect(result).toEqual({
      success: false,
      status: "error",
      error: "cannot start",
    });
  });

  it("surfaces nested API errors on exception", async () => {
    vi.mocked(startExam).mockRejectedValue({
      response: { data: { error: "already submitted" } },
    });

    const result = await enterExamUseCase({
      contestId: "contest-1",
      examModeEnabled: false,
    });

    expect(result).toEqual({
      success: false,
      status: "error",
      error: "already submitted",
    });
  });
});
