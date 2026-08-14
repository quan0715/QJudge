import { describe, expect, it, vi } from "vitest";
import type { CopilotSession, CopilotSessionSummary } from "@copilot";
import { resolveCopilotSessionBootstrap } from "./copilotSessionBootstrap";

const first: CopilotSessionSummary = {
  id: "session-1",
  title: "First",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const hidden: CopilotSession = {
  ...first,
  id: "session-hidden",
  title: "Hidden",
  messages: [],
};

describe("resolveCopilotSessionBootstrap", () => {
  it("loads a located session even when it is absent from the list", async () => {
    const load = vi.fn().mockResolvedValue(hidden);
    const result = await resolveCopilotSessionBootstrap({
      listed: [first],
      locatedId: hidden.id,
      storedId: null,
      strategy: "first-or-create",
      load,
    });

    expect(load).toHaveBeenCalledWith(hidden.id);
    expect(result.selectedSession).toEqual(hidden);
    expect(result.sessions.map((session) => session.id)).toEqual([
      hidden.id,
      first.id,
    ]);
    expect(result.clearLocation).toBe(false);
  });

  it("falls back to the first session for a confirmed missing location", async () => {
    const missing = Object.assign(new Error("missing"), {
      code: "not-found",
      operation: "load-session",
      recoverable: false,
    });
    const result = await resolveCopilotSessionBootstrap({
      listed: [first],
      locatedId: "missing",
      storedId: null,
      strategy: "first-or-create",
      load: vi.fn().mockRejectedValue(missing),
    });

    expect(result.selectedId).toBe(first.id);
    expect(result.clearLocation).toBe(true);
    expect(result.create).toBe(false);
  });

  it("preserves a transiently failing location", async () => {
    const offline = Object.assign(new Error("offline"), {
      code: "transport-error",
      operation: "load-session",
      recoverable: true,
    });
    await expect(
      resolveCopilotSessionBootstrap({
        listed: [first],
        locatedId: "session-offline",
        storedId: null,
        strategy: "first-or-create",
        load: vi.fn().mockRejectedValue(offline),
      }),
    ).rejects.toBe(offline);
  });

  it("requests creation only when first-or-create receives an empty list", async () => {
    const result = await resolveCopilotSessionBootstrap({
      listed: [],
      locatedId: null,
      storedId: null,
      strategy: "first-or-create",
      load: vi.fn(),
    });
    expect(result).toMatchObject({ selectedId: null, create: true });
  });
});
