import type { TestCaseItem } from "@/core/entities/testcase.entity";

export const getCodeKey = (
  problemId: string,
  language: string,
  contestId: string,
  userId: string
) => `qjudge:user:${userId}:contest:${contestId}:problem:${problemId}:code:${language}`;

export const getCustomCasesKey = (problemId: string, contestId: string, userId: string) =>
  `qjudge:user:${userId}:contest:${contestId}:problem:${problemId}:custom_test_cases`;

export const loadCode = (
  problemId: string,
  language: string,
  contestId: string,
  userId: string
) => {
  return localStorage.getItem(getCodeKey(problemId, language, contestId, userId));
};

export const saveCode = (
  problemId: string,
  language: string,
  code: string,
  contestId: string,
  userId: string
) => {
  localStorage.setItem(getCodeKey(problemId, language, contestId, userId), code);
};

export const loadCustomCases = (
  problemId: string,
  contestId: string,
  userId: string
): TestCaseItem[] => {
  try {
    const saved = localStorage.getItem(getCustomCasesKey(problemId, contestId, userId));
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
  contestId: string,
  userId: string
) => {
  localStorage.setItem(
    getCustomCasesKey(problemId, contestId, userId),
    JSON.stringify(cases)
  );
};
