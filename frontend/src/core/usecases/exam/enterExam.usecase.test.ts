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

  it("exam mode always routes to precheck before startExam", async () => {
    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: true,
      answeringEntryPath: "/contests/contest-1/problems",
    });

    expect(startExam).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      status: "started",
      navigateTo: "/contests/contest-1/exam-precheck",
    });
  });

  it("starts exam and navigates dynamically for coding non-exam mode", async () => {
    vi.mocked(startExam).mockResolvedValue({ status: "started" } as any);

    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: false,
      answeringEntryPath: "/contests/contest-1/solve/p1",
    });

    expect(startExam).toHaveBeenCalledWith("contest-1");
    expect(result).toEqual({
      success: true,
      status: "started",
      navigateTo: "/contests/contest-1/solve/p1",
    });
  });

  it("starts exam and navigates dynamically for paper_exam non-exam mode", async () => {
    vi.mocked(startExam).mockResolvedValue({ status: "started" } as any);

    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: false,
      answeringEntryPath: "/contests/contest-1/paper-exam/answering",
    });

    expect(startExam).toHaveBeenCalledWith("contest-1");
    expect(result).toEqual({
      success: true,
      status: "started",
      navigateTo: "/contests/contest-1/paper-exam/answering",
    });
  });

  it("handles unexpected startExam response", async () => {
    vi.mocked(startExam).mockResolvedValue({ error: "cannot start" } as any);

    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: false,
      answeringEntryPath: "/contests/contest-1/problems",
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
      cheatDetectionEnabled: false,
      answeringEntryPath: "/contests/contest-1/problems",
    });

    expect(result).toEqual({
      success: false,
      status: "error",
      error: "already submitted",
    });
  });
});
