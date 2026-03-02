import type { ExamStatusType } from "@/core/entities/contest.entity";

const PRECHECK_GATE_KEY_PREFIX = "qjudge.paper_exam.precheck_gate.v1";

const getPrecheckGateKey = (contestId: string) =>
  `${PRECHECK_GATE_KEY_PREFIX}:${contestId}`;

export const hasPaperExamPrecheckPassed = (contestId: string): boolean => {
  if (!contestId) return false;
  try {
    return !!window.sessionStorage.getItem(getPrecheckGateKey(contestId));
  } catch {
    return false;
  }
};

export const markPaperExamPrecheckPassed = (contestId: string): void => {
  if (!contestId) return;
  try {
    window.sessionStorage.setItem(getPrecheckGateKey(contestId), "1");
  } catch {
    // Ignore storage failure and keep runtime flow functional.
  }
};

export const clearPaperExamPrecheckPassed = (contestId: string): void => {
  if (!contestId) return;
  try {
    window.sessionStorage.removeItem(getPrecheckGateKey(contestId));
  } catch {
    // Ignore storage failure and keep runtime flow functional.
  }
};

export const syncPaperExamPrecheckGateByStatus = (
  contestId: string,
  examStatus?: ExamStatusType | null,
): void => {
  if (!contestId) return;
  if (
    examStatus === "not_started" ||
    examStatus === "paused" ||
    examStatus === "locked" ||
    examStatus === "submitted"
  ) {
    clearPaperExamPrecheckPassed(contestId);
  }
};

