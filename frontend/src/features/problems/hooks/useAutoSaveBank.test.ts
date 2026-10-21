import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "./useAutoSave";
import { patchContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
vi.mock("@/infrastructure/api/repositories/contestProblems.repository", () => ({ patchContestProblem: vi.fn().mockResolvedValue({}) }));
afterEach(() => vi.clearAllMocks());

describe("coding editor save destination", () => {
  it("keeps contest saves on the problem endpoint", async () => {
    const { result } = renderHook(() => useAutoSave({ contestId: "contest", contestProblemId: "problem" }));
    await act(() => result.current.saveField("title", "Changed"));
    expect(patchContestProblem).toHaveBeenCalledWith("contest", "problem", { title: "Changed" });
  });

  it("routes bank edits through its writer and retries errors without losing the edit", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    const { result } = renderHook(() => useAutoSave({ target: "bank:membership", write }));
    await act(() => result.current.saveField("title", "Changed"));
    expect(result.current.globalStatus).toBe("error");
    act(() => result.current.retrySave("title"));
    await waitFor(() => expect(result.current.globalStatus).toBe("saved"));
    expect(write).toHaveBeenNthCalledWith(2, "title", "Changed");
    expect(patchContestProblem).not.toHaveBeenCalled();
  });

  it("flushes a debounced edit when the editor closes", async () => {
    const write = vi.fn().mockResolvedValue({});
    const { result, unmount } = renderHook(() => useAutoSave({ target: "bank:membership", write }));
    act(() => result.current.debouncedSaveField("title", "Last edit"));
    unmount();
    await waitFor(() => expect(write).toHaveBeenCalledWith("title", "Last edit"));
  });
});
