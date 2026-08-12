import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpClient, requestJson } from "./http.client";

describe("httpClient auth refresh", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    window.localStorage.clear();
    window.history.pushState({}, "", "/dashboard");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("refreshes the auth session and retries protected requests after 401", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { access_token: "next" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 1 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const response = await requestJson<{ success: true; data: { id: number } }>(
      httpClient.get("/api/v1/users/me"),
    );

    expect(response.data.id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/users/me");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/v1/users/me");
  });

  it("does not refresh password login failures", async () => {
    window.history.pushState({}, "", "/login");

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      requestJson(
        httpClient.post("/api/v1/auth/login/password", {
          identifier: "alice@example.com",
          password: "wrong",
        }),
      ),
    ).rejects.toThrow("Unauthorized");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/login/password");
  });

  it("can suppress global server-error toasts for optional background reads", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onServerError = vi.fn();
    window.addEventListener("server-error", onServerError);

    const response = await httpClient.get(
      "/api/v1/ai/models/",
      { suppressGlobalError: true },
    );

    expect(response.status).toBe(503);
    expect(onServerError).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("suppressGlobalError");
    window.removeEventListener("server-error", onServerError);
  });
});
