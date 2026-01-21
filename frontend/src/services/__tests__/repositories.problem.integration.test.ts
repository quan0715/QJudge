import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  getProblem,
  getProblemStatistics,
  getProblems,
} from "@/infrastructure/api/repositories/problem.repository";
import { loginAndSetToken, setAuthToken, setupApiTestEnv } from "./helpers/apiTestEnv";
import { TEST_PROBLEMS, TEST_USERS } from "../../../tests/helpers/data.helper";

describe("problem repository integration", () => {
  let restoreFetch: (() => void) | undefined;
  let problemId = "";

  beforeAll(async () => {
    const env = setupApiTestEnv();
    restoreFetch = env.restore;

    await loginAndSetToken({
      email: TEST_USERS.student.email,
      password: TEST_USERS.student.password,
    });

    const problems = await getProblems();
    const target = problems.find(
      (problem) =>
        problem.displayId === TEST_PROBLEMS.aPlusB.displayId ||
        problem.title === TEST_PROBLEMS.aPlusB.title
    );

    if (!target) {
      throw new Error("Seeded problem P001 not found in API response");
    }

    problemId = target.id;
  });

  afterAll(() => {
    setAuthToken();
    restoreFetch?.();
  });

  it("loads problem list with expected entries", async () => {
    const problems = await getProblems();
    const hasSeededProblem = problems.some(
      (problem) => problem.displayId === TEST_PROBLEMS.aPlusB.displayId
    );

    expect(problems.length).toBeGreaterThan(0);
    expect(hasSeededProblem).toBe(true);
  });

  it("loads problem detail and statistics", async () => {
    const detail = await getProblem(problemId);
    const stats = await getProblemStatistics(problemId);

    if (!detail) {
      throw new Error("Problem detail request returned empty response");
    }

    expect(detail.id).toBe(problemId);
    expect(detail.title).toBe(TEST_PROBLEMS.aPlusB.title);
    expect(detail.testCases.length).toBeGreaterThan(0);

    expect(stats.submissionCount).toBeGreaterThanOrEqual(0);
    expect(stats.acceptedCount).toBeGreaterThanOrEqual(0);
    expect(stats.trend.length).toBeGreaterThanOrEqual(0);
  });
});
