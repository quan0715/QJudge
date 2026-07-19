import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTaskSession } from "./useTaskSession";

const manifest = { schema_version: 1, task_type: "grading", context: { contest: "one" }, created_at: "2026-07-19T00:00:00Z" };

describe("useTaskSession auto-bind", () => {
  it("resolves a matching session through both callbacks", async () => {
    const onMatch = vi.fn(async (id: string) => id);
    const onSessionResolved = vi.fn();
    renderHook(() => useTaskSession({ taskType: "grading", taskContext: { contest: "one" }, sessions: [{ id: "session-1", context: { task_manifest: manifest } }], isLoadingSessions: false, boundSessionId: null, isBoundForCurrentContext: false, enabled: true, resolveKey: "one", onMatch, onSessionResolved }));
    await waitFor(() => expect(onSessionResolved).toHaveBeenCalledWith("session-1"));
    expect(onMatch).toHaveBeenCalledWith("session-1");
  });

  it("invokes onEmpty once for the same resolve key", async () => {
    const onEmpty = vi.fn(async () => "created");
    const options = { taskType: "grading", taskContext: { contest: "missing" }, sessions: [], isLoadingSessions: false, boundSessionId: null, isBoundForCurrentContext: false, enabled: true, resolveKey: "missing", onMatch: vi.fn(async () => null), onEmpty };
    const { rerender } = renderHook(() => useTaskSession(options));
    await waitFor(() => expect(onEmpty).toHaveBeenCalledTimes(1));
    rerender();
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });
});
