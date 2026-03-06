import { describe, it, expect, beforeEach } from "vitest";
import {
  hasExamPrecheckPassed,
  markExamPrecheckPassed,
  clearExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./useExamPrecheckGate";

describe("useExamPrecheckGate", () => {
  const contestId = "contest-123";

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("marks and reads precheck state", () => {
    expect(hasExamPrecheckPassed(contestId)).toBe(false);
    markExamPrecheckPassed(contestId);
    expect(hasExamPrecheckPassed(contestId)).toBe(true);
  });

  it("clears precheck state explicitly", () => {
    markExamPrecheckPassed(contestId);
    clearExamPrecheckPassed(contestId);
    expect(hasExamPrecheckPassed(contestId)).toBe(false);
  });

  it("keeps gate when exam is in progress", () => {
    markExamPrecheckPassed(contestId);
    syncExamPrecheckGateByStatus(contestId, "in_progress");
    expect(hasExamPrecheckPassed(contestId)).toBe(true);
  });

  it("clears gate when status requires re-precheck", () => {
    const statuses = ["not_started", "submitted"] as const;

    statuses.forEach((status) => {
      markExamPrecheckPassed(contestId);
      syncExamPrecheckGateByStatus(contestId, status);
      expect(hasExamPrecheckPassed(contestId)).toBe(false);
    });
  });
});
