import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import { loginAndSetToken, setAuthToken, setupApiTestEnv } from "./helpers/apiTestEnv";
import { TEST_PROBLEMS, TEST_USERS } from "@/tests/helpers/data.helper";
import { ensureProblemExists } from "./helpers/problemSeed";

describe("infrastructure http client integration", () => {
  let restoreFetch: (() => void) | undefined;

  beforeAll(async () => {
    const env = setupApiTestEnv();
    restoreFetch = env.restore;

    await loginAndSetToken({
      email: TEST_USERS.teacher.email,
      password: TEST_USERS.teacher.password,
    });
    await ensureProblemExists(TEST_PROBLEMS.aPlusB.title);
  });

  afterAll(() => {
    setAuthToken();
    restoreFetch?.();
  });

  it("requests json from api", async () => {
    const data = await requestJson<any>(
      httpClient.get("/api/v1/management/problems/"),
      "Failed to fetch problems"
    );
    const results = Array.isArray(data?.results) ? data.results : data;

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("ensureOk resolves for successful responses", async () => {
    await expect(
      ensureOk(httpClient.get("/api/v1/management/problems/"), "Failed to fetch problems")
    ).resolves.toBeUndefined();
  });
});
