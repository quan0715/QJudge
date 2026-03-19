import type { ExamStatusType } from "@/core/entities/contest.entity";

const PRECHECK_GATE_KEY_PREFIX = "qjudge.exam.precheck_gate.v1";
const precheckGateMemory = new Set<string>();

const getPrecheckGateKey = (contestId: string) =>
  `${PRECHECK_GATE_KEY_PREFIX}:${contestId}`;

export const hasExamPrecheckPassed = (contestId: string): boolean => {
  if (!contestId) return false;
  if (precheckGateMemory.has(contestId)) return true;
  try {
    const passed = !!window.sessionStorage.getItem(getPrecheckGateKey(contestId));
    if (passed) {
      precheckGateMemory.add(contestId);
    }
    return passed;
  } catch {
    return false;
  }
};

export const markExamPrecheckPassed = (contestId: string): void => {
  if (!contestId) return;
  precheckGateMemory.add(contestId);
  try {
    window.sessionStorage.setItem(getPrecheckGateKey(contestId), "1");
  } catch {
    // Ignore storage failure and keep runtime flow functional.
  }
};

export const clearExamPrecheckPassed = (contestId: string): void => {
  if (!contestId) return;
  precheckGateMemory.delete(contestId);
  try {
    window.sessionStorage.removeItem(getPrecheckGateKey(contestId));
  } catch {
    // Ignore storage failure and keep runtime flow functional.
  }
};

export const syncExamPrecheckGateByStatus = (
  contestId: string,
  examStatus?: ExamStatusType | null,
): void => {
  if (!contestId) return;
  if (examStatus === "not_started") {
    clearExamPrecheckPassed(contestId);
  }
};
