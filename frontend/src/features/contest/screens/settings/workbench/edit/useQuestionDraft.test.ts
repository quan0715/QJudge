import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { questionFixture } from "./workbenchEdit.fixture";
import { useQuestionDraft } from "./useQuestionDraft";
afterEach(() => vi.useRealTimers());
describe("question draft", () => {
  it("saves one edit after 1000ms", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useQuestionDraft(questionFixture("q1"), {
        autosave: true,
        requireScore: true,
        save,
      }),
    );
    act(() => result.current.setForm((p) => ({ ...p, prompt: "Edited" })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Edited" }),
    );
    expect(result.current.dirty).toBe(false);
  });
  it("saves an intentionally empty prompt", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useQuestionDraft(questionFixture("q1"), {
        autosave: true,
        requireScore: true,
        save,
      }),
    );
    act(() => result.current.setForm((p) => ({ ...p, prompt: " " })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ prompt: "" }));
    expect(result.current.error).toBeNull();
  });
  it("rejects navigation flush for an invalid dirty draft", async () => {
    const save = vi.fn();
    const { result } = renderHook(() =>
      useQuestionDraft(questionFixture("q1"), {
        autosave: true,
        requireScore: true,
        save,
      }),
    );
    act(() =>
      result.current.setForm((p) => ({
        ...p,
        prompt: "Keep this draft",
        options: [...p.options, ""],
      })),
    );
    await expect(result.current.flush()).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(result.current.form.prompt).toBe("Keep this draft");
    expect(result.current.dirty).toBe(true);
  });
  it("flushes pending save when the question changes", async () => {
    vi.useFakeTimers();
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ question, save }) =>
        useQuestionDraft(question, {
          autosave: true,
          requireScore: true,
          save,
        }),
      { initialProps: { question: questionFixture("q1"), save: first } },
    );
    act(() => result.current.setForm((p) => ({ ...p, prompt: "Unsent edit" })));
    rerender({ question: questionFixture("q2"), save: second });
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Unsent edit" }),
    );
    expect(second).not.toHaveBeenCalled();
    expect(result.current.form.prompt).toBe("Prompt q2");
    await act(async () => {});
  });
});
