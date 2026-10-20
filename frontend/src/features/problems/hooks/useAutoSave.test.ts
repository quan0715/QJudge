import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useAutoSave } from "./useAutoSave";

describe("useAutoSave", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves through the contest problem route that contest managers can write", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "problem-1", title: "New title" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() =>
      useAutoSave({ contestId: "contest-1", contestProblemId: "binding-1" }),
    );
    await act(() => result.current.saveField("title", "New title"));

    expect(result.current.fieldStates.title?.status).toBe("saved");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/contests/contest-1/problems/binding-1/");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ title: "New title" });
  });
});
