import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  submitSolutionUseCase,
  pollSubmissionUseCase,
} from "@/core/usecases/solver/submitSolution.usecase";
import { testRunUseCase } from "@/core/usecases/solver/testRun.usecase";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import { setupApiTestEnv, loginAndSetToken, setAuthToken } from "./helpers/apiTestEnv";
import {
  TEST_CODE_SAMPLES,
  TEST_PROBLEMS,
  TEST_USERS,
} from "../../../tests/helpers/data.helper";

describe("solver use case integration", () => {
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
      (problem) => problem.displayId === TEST_PROBLEMS.aPlusB.displayId
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

  it("runs test cases via testRunUseCase", async () => {
    const result = await testRunUseCase({
      problemId,
      language: "cpp",
      code: TEST_CODE_SAMPLES.aPlusBCorrect,
      customTestCases: [{ input: "1 2\n" }],
      useSamples: true,
    });

    expect(result.success).toBe(true);
    expect(result.total).toBe(result.cases.length);
    expect(result.passed + result.failed).toBeLessThanOrEqual(result.total);
  });

  it("submits solution and polls result", async () => {
    const submissionResult = await submitSolutionUseCase({
      problemId,
      language: "cpp",
      code: TEST_CODE_SAMPLES.aPlusBCorrect,
    });

    expect(submissionResult.success).toBe(true);
    expect(submissionResult.result?.submissionId).toBeDefined();
    expect(submissionResult.result?.total).toBeGreaterThanOrEqual(0);

    const submissionId = submissionResult.result?.submissionId;

    if (!submissionId) {
      throw new Error("Submit solution use case did not return submissionId");
    }

    const pollResult = await pollSubmissionUseCase(submissionId);

    expect(pollResult.success).toBe(true);
    expect(pollResult.result?.submissionId).toBe(submissionId);
  });
});
