import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hasExamPrecheckPassed,
  markExamPrecheckPassed,
  clearExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./useExamPrecheckGate";

describe("useExamPrecheckGate", () => {
  const contestId = "contest-123";

  beforeEach(() => {
    clearExamPrecheckPassed(contestId);
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
    markExamPrecheckPassed(contestId);
    syncExamPrecheckGateByStatus(contestId, "not_started");
    expect(hasExamPrecheckPassed(contestId)).toBe(false);
  });

  it("clears gate when paused for environment re-check", () => {
    markExamPrecheckPassed(contestId);
    syncExamPrecheckGateByStatus(contestId, "paused");
    expect(hasExamPrecheckPassed(contestId)).toBe(false);
  });

  it("falls back to in-memory gate when storage is unavailable", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });

    markExamPrecheckPassed(contestId);
    expect(hasExamPrecheckPassed(contestId)).toBe(true);

    clearExamPrecheckPassed(contestId);
    expect(hasExamPrecheckPassed(contestId)).toBe(false);

    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
  });
});
