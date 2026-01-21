import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  getSubmission,
  getSubmissions,
  submitSolution,
} from "@/infrastructure/api/repositories/submission.repository";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import { setupApiTestEnv, loginAndSetToken, setAuthToken } from "./helpers/apiTestEnv";
import {
  TEST_CODE_SAMPLES,
  TEST_PROBLEMS,
  TEST_USERS,
} from "../../../tests/helpers/data.helper";
import type { SubmissionDetail } from "@/core/entities/submission.entity";

describe("submission repository integration", () => {
  let restoreFetch: (() => void) | undefined;
  let submission: SubmissionDetail | undefined;
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

    submission = await submitSolution({
      problem_id: problemId,
      language: "cpp",
      code: TEST_CODE_SAMPLES.aPlusBCorrect,
    });
  });

  afterAll(() => {
    setAuthToken();
    restoreFetch?.();
  });

  it("submits solution and returns detail", () => {
    expect(submission?.id).toBeDefined();
    expect(submission?.status).toBeDefined();
    expect(submission?.problemId).toBe(problemId);
  });

  it("fetches submission detail", async () => {
    if (!submission) {
      throw new Error("Submission did not complete in setup");
    }

    const detail = await getSubmission(submission.id);

    expect(detail.id).toBe(submission.id);
    expect(detail.problemId).toBe(problemId);
  });

  it("lists submissions for problem", async () => {
    const result = await getSubmissions({ problem: problemId, page_size: 5 });

    expect(result.count).toBeGreaterThan(0);
    expect(result.results.length).toBeGreaterThan(0);
  });
});
