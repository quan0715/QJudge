import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExamSessionResponse } from "@/core/ports/examSession.repository";
import { enterExamUseCase } from "./enterExam.usecase";

const startExam = vi.fn();
const dependencies = { startExam };

describe("enterExam.usecase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exam mode always routes to precheck before startExam", async () => {
    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: true,
      answeringEntryPath: "/classrooms/classroom-1/contest/contest-1/solve",
      precheckPath: "/classrooms/classroom-1/contest/contest-1/exam-precheck",
    }, dependencies);

    expect(startExam).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      status: "started",
      navigateTo: "/classrooms/classroom-1/contest/contest-1/exam-precheck",
    });
  });

  it("starts exam and navigates dynamically for coding non-exam mode", async () => {
    startExam.mockResolvedValue({ status: "started" });

    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: false,
      answeringEntryPath: "/classrooms/classroom-1/contest/contest-1/solve/p1",
    }, dependencies);

    expect(startExam).toHaveBeenCalledWith("contest-1");
    expect(result).toEqual({
      success: true,
      status: "started",
      navigateTo: "/classrooms/classroom-1/contest/contest-1/solve/p1",
    });
  });

  it("starts exam and navigates dynamically for paper_exam non-exam mode", async () => {
    startExam.mockResolvedValue({ status: "started" });

    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: false,
      answeringEntryPath: "/classrooms/classroom-1/contest/contest-1/solve",
    }, dependencies);

    expect(startExam).toHaveBeenCalledWith("contest-1");
    expect(result).toEqual({
      success: true,
      status: "started",
      navigateTo: "/classrooms/classroom-1/contest/contest-1/solve",
    });
  });

  it("handles unexpected startExam response", async () => {
    startExam.mockResolvedValue({
      status: "",
      error: "cannot start",
    } satisfies ExamSessionResponse);

    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: false,
      answeringEntryPath: "/classrooms/classroom-1/contest/contest-1/solve",
    }, dependencies);

    expect(result).toEqual({
      success: false,
      status: "error",
      error: "cannot start",
    });
  });

  it("surfaces nested API errors on exception", async () => {
    startExam.mockRejectedValue({
      response: { data: { error: "already submitted" } },
    });

    const result = await enterExamUseCase({
      contestId: "contest-1",
      cheatDetectionEnabled: false,
      answeringEntryPath: "/classrooms/classroom-1/contest/contest-1/solve",
    }, dependencies);

    expect(result).toEqual({
      success: false,
      status: "error",
      error: "already submitted",
    });
  });
});
