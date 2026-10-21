import { httpClient, requestJson } from "@/infrastructure/api/http.client";

type Page<T> = { results?: T[] } | T[];
const rows = <T,>(page: Page<T>): T[] => (Array.isArray(page) ? page : page.results ?? []);

/**
 * Locate a problem from seed_e2e_data. Problems only exist inside contests, so
 * look it up through the seeded contest the signed-in manager can see.
 */
export const findSeededContestProblem = async (
  contestName: string,
  problemTitle: string
): Promise<{ contestId: string; contestProblemId: string; problemId: string; title: string }> => {
  const contests = rows(
    await requestJson<Page<{ id: string; name: string }>>(
      httpClient.get("/api/v1/contests/?scope=manage"),
      "Failed to fetch contests"
    )
  );
  const contest = contests.find((item) => item.name === contestName);
  if (!contest) throw new Error(`Seeded contest not found: ${contestName}`);

  const problems = rows(
    await requestJson<Page<{ id: string; problem_id: string; title: string }>>(
      httpClient.get(`/api/v1/contests/${contest.id}/problems/`),
      "Failed to fetch contest problems"
    )
  );
  const problem = problems.find((item) => item.title === problemTitle);
  if (!problem) throw new Error(`Seeded problem not found in ${contestName}: ${problemTitle}`);

  return { contestId: contest.id, contestProblemId: problem.id, problemId: problem.problem_id, title: problem.title };
};
