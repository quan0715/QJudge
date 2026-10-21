import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { testRun } from "@/infrastructure/api/repositories/problem.repository";
import { getContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
import { loginAndSetToken, setAuthToken, setupApiTestEnv } from "./helpers/apiTestEnv";
import {
  TEST_CODE_SAMPLES,
  TEST_CONTESTS,
  TEST_PROBLEMS,
  TEST_USERS,
} from "@/tests/helpers/data.helper";
import { findSeededContestProblem } from "./helpers/problemSeed";

describe("problem repository integration", () => {
  let restoreFetch: (() => void) | undefined;
  let contestId = "";
  let contestProblemId = "";
  let problemId = "";
  let problemTitle = "";

  beforeAll(async () => {
    const env = setupApiTestEnv();
    restoreFetch = env.restore;

    await loginAndSetToken({
      email: TEST_USERS.teacher.email,
      password: TEST_USERS.teacher.password,
    });

    const target = await findSeededContestProblem(TEST_CONTESTS.active.name, TEST_PROBLEMS.aPlusB.title);
    contestId = target.contestId;
    contestProblemId = target.contestProblemId;
    problemId = target.problemId;
    problemTitle = target.title;
  });

  afterAll(() => {
    setAuthToken();
    restoreFetch?.();
  });

  it("loads problem detail", async () => {
    const detail = await getContestProblem(contestId, contestProblemId);

    if (!detail) {
      throw new Error("Problem detail request returned empty response");
    }

    expect(detail.id).toBe(problemId);
    expect(detail.title).toBe(problemTitle);
    expect(detail.testCases.length).toBeGreaterThan(0);
  });

  it("runs server-side test cases", async () => {
    const result = await testRun(problemId, {
      language: "cpp",
      code: TEST_CODE_SAMPLES.aPlusBCorrect,
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every((item) => typeof item.status === "string")).toBe(true);
  });
});
