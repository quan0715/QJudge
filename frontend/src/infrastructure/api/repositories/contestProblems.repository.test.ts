import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateContestProblemScore } from "./contestProblems.repository";

describe("updateContestProblemScore", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("patches the contest binding score and returns the persisted value", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ max_score: 35, score: 35 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await updateContestProblemScore("contest-1", "binding-1", 35);

    expect(result).toBe(35);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/contests/contest-1/problems/binding-1/score/");
    expect(options.method).toBe("PATCH");
    expect(options.credentials).toBe("include");
    expect(JSON.parse(options.body as string)).toEqual({ max_score: 35 });
  });
});
