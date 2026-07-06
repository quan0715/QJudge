import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchUsers, updateUserRole, uploadAvatar } from "./user.repository";

describe("user repository endpoints", () => {
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

  it("searchUsers calls the users collection endpoint with q", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await searchUsers("alice");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/users/?q=alice");
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");
  });

  it("updateUserRole calls the users role endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { id: 7, role: "teacher" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await updateUserRole(7, "teacher");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/users/7/role");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ role: "teacher" });
  });

  it("uploadAvatar sends multipart FormData to the users avatar endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { avatar_url: "/avatar.png" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await uploadAvatar(new File(["avatar"], "avatar.png", { type: "image/png" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/users/me/avatar");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });
});
