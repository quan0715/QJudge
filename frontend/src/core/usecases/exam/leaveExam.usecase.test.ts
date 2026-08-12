import { beforeEach, describe, expect, it, vi } from "vitest";

import { leaveExamUseCase } from "./leaveExam.usecase";

const endExam = vi.fn();
const exitFullscreen = vi.fn();
const dependencies = { endExam, exitFullscreen };

describe("leaveExam.usecase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    exitFullscreen.mockResolvedValue(true);
  });

  it("ends exam then navigates to dashboard by default", async () => {
    endExam.mockResolvedValue({ status: "submitted" });

    const result = await leaveExamUseCase({
      contestId: "contest-1",
      shouldEndExam: true,
      uploadSessionId: "upload-session-1",
    }, dependencies);

    expect(endExam).toHaveBeenCalledWith("contest-1", {
      upload_session_id: "upload-session-1",
    });
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(result).toEqual({
      success: true,
      navigateTo: "/dashboard",
    });
  });

  it("still exits fullscreen and navigates when endExam fails", async () => {
    endExam.mockRejectedValue(new Error("api down"));

    const result = await leaveExamUseCase({
      contestId: "contest-1",
      shouldEndExam: true,
    }, dependencies);

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(result).toEqual({
      success: false,
      navigateTo: "/dashboard",
      error: "api down",
    });
  });

  it("respects custom navigateTo without ending the exam", async () => {
    const result = await leaveExamUseCase({
      contestId: "contest-1",
      shouldEndExam: false,
      navigateTo: "/classrooms/c-1/contest/contest-1",
    }, dependencies);

    expect(endExam).not.toHaveBeenCalled();
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(result).toEqual({
      success: true,
      navigateTo: "/classrooms/c-1/contest/contest-1",
    });
  });
});
