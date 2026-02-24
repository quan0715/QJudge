import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  getContest,
  getContests,
} from "@/infrastructure/api/repositories/contest.repository";
import { loginAndSetToken, setAuthToken, setupApiTestEnv } from "./helpers/apiTestEnv";
import { TEST_CONTESTS, TEST_USERS } from "@/tests/helpers/data.helper";

describe("contest repository integration", () => {
  let restoreFetch: (() => void) | undefined;
  let contestId = "";

  beforeAll(async () => {
    const env = setupApiTestEnv();
    restoreFetch = env.restore;

    await loginAndSetToken({
      email: TEST_USERS.student.email,
      password: TEST_USERS.student.password,
    });

    const contests = await getContests();
    const target = contests.find(
      (contest) => contest.name === TEST_CONTESTS.active.name
    );

    if (!target) {
      throw new Error("Seeded contest not found in API response");
    }

    contestId = target.id;
  });

  afterAll(() => {
    setAuthToken();
    restoreFetch?.();
  });

  it("loads contest list", async () => {
    const contests = await getContests();
    const hasSeededContest = contests.some(
      (contest) => contest.name === TEST_CONTESTS.active.name
    );

    expect(contests.length).toBeGreaterThan(0);
    expect(hasSeededContest).toBe(true);
  });

  it("loads contest detail", async () => {
    const detail = await getContest(contestId);

    if (!detail) {
      throw new Error("Contest detail request returned empty response");
    }

    expect(detail.id).toBe(contestId);
    expect(detail.name).toBe(TEST_CONTESTS.active.name);
    expect(Array.isArray(detail.problems)).toBe(true);
    expect(detail.visibility).toBeDefined();
  });
});
