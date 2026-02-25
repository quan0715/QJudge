import { beforeEach, describe, expect, it, vi } from "vitest";

import { joinContestUseCase, validateJoinContest } from "./joinContest.usecase";

vi.mock("@/infrastructure/api/repositories", () => ({
  registerContest: vi.fn(),
}));

import { registerContest } from "@/infrastructure/api/repositories";

describe("joinContest.usecase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fails validation for private contest without password", () => {
    const result = validateJoinContest(
      {
        id: "c1",
        name: "Private Contest",
        startTime: "",
        endTime: "",
        status: "published",
        visibility: "private",
        isRegistered: false,
      },
      undefined
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("This contest requires a password");
  });

  it("fails validation when already registered", () => {
    const result = validateJoinContest(
      {
        id: "c1",
        name: "Contest",
        startTime: "",
        endTime: "",
        status: "published",
        visibility: "public",
        isRegistered: true,
      },
      undefined
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Already registered for this contest");
  });

  it("passes validation for public contest", () => {
    const result = validateJoinContest(
      {
        id: "c1",
        name: "Contest",
        startTime: "",
        endTime: "",
        status: "published",
        visibility: "public",
        isRegistered: false,
      },
      undefined
    );

    expect(result).toEqual({ valid: true });
  });

  it("returns success when registerContest resolves", async () => {
    vi.mocked(registerContest).mockResolvedValue(undefined as void);

    const result = await joinContestUseCase({
      contestId: "c1",
      password: "secret",
      nickname: "neo",
    });

    expect(registerContest).toHaveBeenCalledWith("c1", {
      password: "secret",
      nickname: "neo",
    });
    expect(result).toEqual({ success: true });
  });

  it("returns repository error message when registerContest rejects", async () => {
    vi.mocked(registerContest).mockRejectedValue(new Error("join failed"));

    const result = await joinContestUseCase({
      contestId: "c1",
    });

    expect(result).toEqual({ success: false, error: "join failed" });
  });
});
