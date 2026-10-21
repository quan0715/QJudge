import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportClassroomGradebook,
  getClassroomGradebook,
  regenerateCode,
  updateMemberRole,
} from "./classroom.repository";

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

describe("getClassroomGradebook", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the gradebook and maps snake_case to camelCase", async () => {
    const classroomId = "924abae8-bf3a-4479-8e38-bfbdfe9ea0fa";

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contests: [
            {
              id: "12",
              name: "Lab 1",
              contest_type: "coding",
              start_time: null,
              max_score: 300,
            },
            {
              id: "13",
              name: "Midterm",
              contest_type: "paper_exam",
              start_time: "2026-10-01T02:00:00Z",
              max_score: 100,
            },
          ],
          students: [
            {
              user_id: 5,
              username: "110550001",
              display_name: "王小明",
              scores: { "12": 300, "13": null },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const gradebook = await getClassroomGradebook(classroomId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/v1/classrooms/${classroomId}/gradebook/`,
    );
    expect(gradebook).toEqual({
      contests: [
        {
          id: "12",
          name: "Lab 1",
          contestType: "coding",
          startTime: null,
          maxScore: 300,
        },
        {
          id: "13",
          name: "Midterm",
          contestType: "paper_exam",
          startTime: "2026-10-01T02:00:00Z",
          maxScore: 100,
        },
      ],
      students: [
        {
          userId: 5,
          username: "110550001",
          displayName: "王小明",
          scores: { "12": 300, "13": null },
        },
      ],
    });
  });
});

describe("exportClassroomGradebook", () => {
  const fetchMock = vi.fn();
  const createObjectURL = vi.fn(() => "blob:gradebook");
  const revokeObjectURL = vi.fn();
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let downloadedNames: string[];

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    downloadedNames = [];
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedNames.push(this.download);
      });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.unstubAllGlobals();
  });

  it("downloads the csv using the filename from Content-Disposition", async () => {
    const classroomId = "924abae8-bf3a-4479-8e38-bfbdfe9ea0fa";

    fetchMock.mockResolvedValueOnce(
      new Response("學號,姓名\n110550001,王小明\n", {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition":
            'attachment; filename="classroom_A_gradebook.csv"',
        },
      }),
    );

    await exportClassroomGradebook(classroomId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/v1/classrooms/${classroomId}/gradebook/export/`,
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloadedNames).toEqual(["classroom_A_gradebook.csv"]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:gradebook");
  });

  it("falls back to a default filename without Content-Disposition", async () => {
    const classroomId = "924abae8-bf3a-4479-8e38-bfbdfe9ea0fa";

    fetchMock.mockResolvedValueOnce(
      new Response("a,b\n", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );

    await exportClassroomGradebook(classroomId);

    expect(downloadedNames).toEqual([`classroom_${classroomId}_gradebook.csv`]);
  });

  it("rejects when the server responds 403", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(exportClassroomGradebook("any-id")).rejects.toThrow();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
