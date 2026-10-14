import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  getSubmission,
  getSubmissions,
  submitSolution,
} from "@/infrastructure/api/repositories/submission.repository";
import { getContest, getContests } from "@/infrastructure/api/repositories/contest.repository";
import { setupApiTestEnv, loginAndSetToken, setAuthToken } from "./helpers/apiTestEnv";
import {
  TEST_CODE_SAMPLES,
  TEST_CONTESTS,
  TEST_PROBLEMS,
  TEST_USERS,
} from "@/tests/helpers/data.helper";
import type { SubmissionDetail } from "@/core/entities/submission.entity";

describe("submission repository integration", () => {
  let restoreFetch: (() => void) | undefined;
  let submission: SubmissionDetail | undefined;
  let problemId = "";

  beforeAll(async () => {
    const env = setupApiTestEnv();
    restoreFetch = env.restore;

    await loginAndSetToken({
      email: TEST_USERS.teacher.email,
      password: TEST_USERS.teacher.password,
    });

    // Every submission belongs to a contest; the seeded active contest binds A+B.
    const contest = (await getContests()).find(
      (item) => item.name === TEST_CONTESTS.active.name
    );
    const detail = contest && (await getContest(contest.id));
    const problem = detail?.problems.find(
      (item) => item.title === TEST_PROBLEMS.aPlusB.title
    );
    if (!contest || !problem) {
      throw new Error("Seeded contest with A+B Problem not found");
    }
    problemId = problem.problemId;

    submission = await submitSolution({
      problem_id: problemId,
      contest_id: contest.id,
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
