import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  issueTeacherActivationInvite,
  searchUsers,
  updateUserRole,
} from "./auth.repository";

describe("auth repository admin endpoints", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    document.cookie = "csrftoken=test-csrf-token";
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    window.localStorage.clear();
  });

  it("searchUsers calls the auth search endpoint with q", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await searchUsers("alice");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/search?q=alice");
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");
  });

  it("updateUserRole calls the auth role endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { id: 7, role: "teacher" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await updateUserRole(7, "teacher");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/7/role");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ role: "teacher" });
  });

  it("issueTeacherActivationInvite calls teacher-activations", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 1,
            created_at: "2026-04-14T00:00:00Z",
            expires_at: "2026-04-15T00:00:00Z",
            status: "pending",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await issueTeacherActivationInvite("teacher@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/teacher-activations");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ email: "teacher@example.com" });
  });
});
