import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSubmittedExamSessionResponse, startExam, EXAM_STARTED_EVENT,
} from "./exam.repository";
import type { ExamSessionResponse } from "@/core/ports/examSession.repository";

describe("isSubmittedExamSessionResponse", () => {
  it("accepts a submitted exam response", () => {
    const response: ExamSessionResponse = {
      status: "finished",
      exam_status: "submitted",
      already_submitted: false,
    };

    expect(isSubmittedExamSessionResponse(response)).toBe(true);
  });

  it("rejects non-submitted or missing responses", () => {
    expect(
      isSubmittedExamSessionResponse({
        status: "started",
        exam_status: "in_progress",
      }),
    ).toBe(false);
    expect(isSubmittedExamSessionResponse(null)).toBe(false);
    expect(isSubmittedExamSessionResponse(undefined)).toBe(false);
  });
});


afterEach(() => vi.unstubAllGlobals());
it("announces only a successful in_progress admission", async () => {
  const observer = vi.fn();
  window.addEventListener(EXAM_STARTED_EVENT, observer);
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({status: "started", exam_status: "in_progress"})))
    .mockResolvedValueOnce(new Response(JSON.stringify({status: "refused"})))
    .mockRejectedValueOnce(new Error("network failed"));
  vi.stubGlobal("fetch", fetcher);
  try {
    await startExam("contest-1");
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0].detail).toEqual({contestId: "contest-1"});
    await startExam("contest-2");
    await expect(startExam("contest-3")).rejects.toThrow();
    expect(observer).toHaveBeenCalledTimes(1);
  } finally {window.removeEventListener(EXAM_STARTED_EVENT, observer);}
});
