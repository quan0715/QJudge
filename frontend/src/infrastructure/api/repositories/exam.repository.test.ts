import { describe, expect, it } from "vitest";
import {
  isSubmittedExamSessionResponse,
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
