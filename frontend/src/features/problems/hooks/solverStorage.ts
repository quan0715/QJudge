import type { TestCaseItem } from "@/core/entities/testcase.entity";

export const getCodeKey = (
  problemId: string,
  language: string,
  contestId?: string
) => {
  if (contestId) {
    return `qjudge:contest:${contestId}:problem:${problemId}:code:${language}`;
  }
  return `qjudge:problem:${problemId}:code:${language}`;
};

export const getCustomCasesKey = (problemId: string, contestId?: string) => {
  if (contestId) {
    return `qjudge:contest:${contestId}:problem:${problemId}:custom_test_cases`;
  }
  return `qjudge:problem:${problemId}:custom_test_cases`;
};

export const loadCode = (
  problemId: string,
  language: string,
  contestId?: string
) => {
  return localStorage.getItem(getCodeKey(problemId, language, contestId));
};

export const saveCode = (
  problemId: string,
  language: string,
  code: string,
  contestId?: string
) => {
  localStorage.setItem(getCodeKey(problemId, language, contestId), code);
};

export const loadCustomCases = (
  problemId: string,
  contestId?: string
): TestCaseItem[] => {
  try {
    const saved = localStorage.getItem(getCustomCasesKey(problemId, contestId));
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse custom test cases", error);
    return [];
  }
};

export const saveCustomCases = (
  problemId: string,
  cases: TestCaseItem[],
  contestId?: string
) => {
  localStorage.setItem(
    getCustomCasesKey(problemId, contestId),
    JSON.stringify(cases)
  );
};
