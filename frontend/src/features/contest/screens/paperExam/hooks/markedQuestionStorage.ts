const MARKED_PREFIX = "qjudge.exam.marked";

const keyForContest = (contestId: string) => `${MARKED_PREFIX}.${contestId}`;

export const getMarkedQuestionIds = (contestId: string | undefined): Set<string> => {
  if (!contestId) return new Set();
  try {
    const raw = localStorage.getItem(keyForContest(contestId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((item) => typeof item === "string"))
      : new Set();
  } catch {
    return new Set();
  }
};

export const saveMarkedQuestionIds = (
  contestId: string | undefined,
  ids: Set<string>,
): void => {
  if (!contestId) return;
  try {
    if (ids.size === 0) {
      localStorage.removeItem(keyForContest(contestId));
      return;
    }
    localStorage.setItem(keyForContest(contestId), JSON.stringify([...ids]));
  } catch {
    // localStorage can be unavailable; marking is a UI aid only.
  }
};
