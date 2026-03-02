import { describe, it, expect, beforeEach } from "vitest";
import {
  hasPaperExamPrecheckPassed,
  markPaperExamPrecheckPassed,
  clearPaperExamPrecheckPassed,
  syncPaperExamPrecheckGateByStatus,
} from "./precheckGate";

describe("precheckGate", () => {
  const contestId = "contest-123";

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("marks and reads precheck state", () => {
    expect(hasPaperExamPrecheckPassed(contestId)).toBe(false);
    markPaperExamPrecheckPassed(contestId);
    expect(hasPaperExamPrecheckPassed(contestId)).toBe(true);
  });

  it("clears precheck state explicitly", () => {
    markPaperExamPrecheckPassed(contestId);
    clearPaperExamPrecheckPassed(contestId);
    expect(hasPaperExamPrecheckPassed(contestId)).toBe(false);
  });

  it("keeps gate when exam is in progress", () => {
    markPaperExamPrecheckPassed(contestId);
    syncPaperExamPrecheckGateByStatus(contestId, "in_progress");
    expect(hasPaperExamPrecheckPassed(contestId)).toBe(true);
  });

  it("clears gate when status requires re-precheck", () => {
    const statuses = ["not_started", "paused", "locked", "submitted"] as const;

    statuses.forEach((status) => {
      markPaperExamPrecheckPassed(contestId);
      syncPaperExamPrecheckGateByStatus(contestId, status);
      expect(hasPaperExamPrecheckPassed(contestId)).toBe(false);
    });
  });
});

