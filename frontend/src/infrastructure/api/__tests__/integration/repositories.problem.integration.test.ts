import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  getProblem,
  getProblemStatistics,
  getProblems,
} from "@/infrastructure/api/repositories/problem.repository";
import { loginAndSetToken, setAuthToken, setupApiTestEnv } from "./helpers/apiTestEnv";
import { TEST_PROBLEMS, TEST_USERS } from "@/tests/helpers/data.helper";
import { ensureProblemExists } from "./helpers/problemSeed";

describe("problem repository integration", () => {
  let restoreFetch: (() => void) | undefined;
  let problemId = "";
  let problemTitle = "";

  beforeAll(async () => {
    const env = setupApiTestEnv();
    restoreFetch = env.restore;

    await loginAndSetToken({
      email: TEST_USERS.teacher.email,
      password: TEST_USERS.teacher.password,
    });

    const target = await ensureProblemExists(TEST_PROBLEMS.aPlusB.title);
    problemId = target.id;
    problemTitle = target.title;
  });

  afterAll(() => {
    setAuthToken();
    restoreFetch?.();
  });

  it("loads problem list with expected entries", async () => {
    const problems = await getProblems();
    const hasTargetProblem = problems.some((problem) => problem.id === problemId);

    expect(problems.length).toBeGreaterThan(0);
    expect(hasTargetProblem).toBe(true);
  });

  it("loads problem detail and statistics", async () => {
    const detail = await getProblem(problemId);
    const stats = await getProblemStatistics(problemId);

    if (!detail) {
      throw new Error("Problem detail request returned empty response");
    }

    expect(detail.id).toBe(problemId);
    expect(detail.title).toBe(problemTitle);
    expect(detail.testCases.length).toBeGreaterThan(0);

    expect(stats.submissionCount).toBeGreaterThanOrEqual(0);
    expect(stats.acceptedCount).toBeGreaterThanOrEqual(0);
    expect(stats.trend.length).toBeGreaterThanOrEqual(0);
  });
});
