import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { regenerateCode, updateMemberRole } from "./classroom.repository";

describe("updateMemberRole", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("patches member detail with role", async () => {
    const classroomId = "924abae8-bf3a-4479-8e38-bfbdfe9ea0fa";
    const userId = 54;

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Member role updated." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await updateMemberRole(classroomId, userId, "ta");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/classrooms/${classroomId}/members/${userId}/`);
    expect(options.method).toBe("PATCH");
    expect(options.credentials).toBe("include");
    expect(JSON.parse(options.body as string)).toEqual({ role: "ta" });
    const headers = options.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});

describe("regenerateCode", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to invite-code without legacy toggle payload", async () => {
    const classroomId = "924abae8-bf3a-4479-8e38-bfbdfe9ea0fa";

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ invite_code: "ABCD1234" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await regenerateCode(classroomId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/classrooms/${classroomId}/invite-code/`);
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.body).toBeUndefined();
  });
});
