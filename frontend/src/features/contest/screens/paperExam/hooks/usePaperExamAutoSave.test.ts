import { renderHook, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExamAnswerPayload,
  usePaperExamAutoSave,
} from "./usePaperExamAutoSave";
import { submitExamAnswer, saveExamAnswerDraft } from "@/infrastructure/api/repositories/examAnswers.repository";
import { createEmptyOpenAnswerDocument } from "@/shared/ui/editor";

vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  submitExamAnswer: vi.fn().mockResolvedValue({}),
  saveExamAnswerDraft: vi.fn(),
}));

const mockedSubmitExamAnswer = vi.mocked(submitExamAnswer);

describe("buildExamAnswerPayload", () => {
  it("returns selected payload for objective types", () => {
    expect(buildExamAnswerPayload(1, "single_choice")).toEqual({ selected: 1 });
    expect(buildExamAnswerPayload(0, "true_false")).toEqual({ selected: 0 });
    expect(buildExamAnswerPayload([0, 2], "multiple_choice")).toEqual({
      selected: [0, 2],
    });
  });

  it("returns text payload for subjective string values", () => {
    expect(buildExamAnswerPayload("my answer", "essay")).toEqual({
      text: "my answer",
    });
  });

  it("returns document payload for open document answers", () => {
    const document = createEmptyOpenAnswerDocument();

    expect(buildExamAnswerPayload(document, "essay", "open_document")).toEqual({
      document,
    });
  });
});

describe("usePaperExamAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedSubmitExamAnswer.mockReset().mockResolvedValue({} as never);
    vi.mocked(saveExamAnswerDraft).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits selected payload for single_choice", async () => {
    const setAnswers = vi.fn();
    const { result } = renderHook(() =>
      usePaperExamAutoSave({
        contestId: "contest-1",
        setAnswers: setAnswers as never,
      }),
    );

    act(() => {
      result.current.handleAnswerChange("11", 2, "single_choice");
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockedSubmitExamAnswer).toHaveBeenCalledWith(
      "contest-1",
      "11",
      { selected: 2 },
    );
  });

  it("submits selected payload for true_false", async () => {
    const setAnswers = vi.fn();
    const { result } = renderHook(() =>
      usePaperExamAutoSave({
        contestId: "contest-2",
        setAnswers: setAnswers as never,
      }),
    );

    act(() => {
      result.current.handleAnswerChange("22", 1, "true_false");
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockedSubmitExamAnswer).toHaveBeenCalledWith(
      "contest-2",
      "22",
      { selected: 1 },
    );
  });

  it("submits text payload for essay", async () => {
    const setAnswers = vi.fn();
    const { result } = renderHook(() =>
      usePaperExamAutoSave({
        contestId: "contest-3",
        setAnswers: setAnswers as never,
      }),
    );

    act(() => {
      result.current.handleAnswerChange("33", "explain", "essay");
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockedSubmitExamAnswer).toHaveBeenCalledWith(
      "contest-3",
      "33",
      { text: "explain" },
    );
  });

  it("submits document payload for open document answers", async () => {
    const setAnswers = vi.fn();
    const document = createEmptyOpenAnswerDocument();
    const { result } = renderHook(() =>
      usePaperExamAutoSave({
        contestId: "contest-4",
        setAnswers: setAnswers as never,
      }),
    );

    act(() => {
      result.current.handleAnswerChange("44", document, "essay", "open_document");
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockedSubmitExamAnswer).toHaveBeenCalledWith(
      "contest-4",
      "44",
      { document },
    );
  });

  it("does not report saved while a newer answer is still pending debounce", async () => {
    let resolveFirstSave: (() => void) | undefined;
    mockedSubmitExamAnswer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSave = () => resolve({} as never);
        }),
    );

    const setAnswers = vi.fn();
    const { result } = renderHook(() =>
      usePaperExamAutoSave({
        contestId: "contest-4",
        setAnswers: setAnswers as never,
      }),
    );

    act(() => {
      result.current.handleAnswerChange("q1", "first", "essay");
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    act(() => {
      result.current.handleAnswerChange("q2", "second", "essay");
    });

    await act(async () => {
      resolveFirstSave?.();
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("saving");
  });

  it("flushes a debounced answer before final submission and leaves no later write", async () => {
    const { result } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "final answer", "essay"));
    await act(async () => { await result.current.flushAll(); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledExactlyOnceWith(
      "contest-reset", "q1", { text: "final answer" },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledOnce();
    expect(result.current.saveStatus).toBe("saved");
  });

  it("waits for an already running save before the submission can finish", async () => {
    let resolveSave!: () => void;
    mockedSubmitExamAnswer.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = () => resolve({} as never);
    }));
    const { result } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "final answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    let completed = false;
    let flush!: Promise<void>;
    await act(async () => { flush = result.current.flushAll().then(() => { completed = true; }); });
    expect(completed).toBe(false);
    await act(async () => { resolveSave(); await flush; });
    expect(completed).toBe(true);
    expect(mockedSubmitExamAnswer).toHaveBeenCalledOnce();
  });

  it("rejects final submission when a pending answer cannot be saved", async () => {
    mockedSubmitExamAnswer.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "keep my answer", "essay"));
    await act(async () => { await expect(result.current.flushAll()).rejects.toThrow("network down"); });
    expect(result.current.saveStatus).toBe("error");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledOnce();
    await act(async () => { await result.current.flushAll(); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledTimes(2);
    expect(mockedSubmitExamAnswer).toHaveBeenLastCalledWith("contest-reset", "q1", { text: "keep my answer" });
    expect(result.current.saveStatus).toBe("saved");
  });

  it("cancels timers on unmount without losing the unsaved answer", async () => {
    const { result, unmount } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "unsaved answer", "essay"));
    unmount();
    expect(saveExamAnswerDraft).toHaveBeenCalledWith("contest-reset", "q1", { text: "unsaved answer" });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mockedSubmitExamAnswer).not.toHaveBeenCalled();
  });

  it("saves the newer pending edit after an older in-flight write finishes", async () => {
    let resolveSave!: () => void;
    mockedSubmitExamAnswer.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = () => resolve({} as never);
    }));
    const { result } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "older answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    act(() => result.current.handleAnswerChange("q1", "latest answer", "essay"));
    let flush!: Promise<void>;
    await act(async () => { flush = result.current.flushAll(); });
    act(() => result.current.handleAnswerChange("q1", "latest answer during flush", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledOnce();
    await act(async () => { resolveSave(); await flush; });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledTimes(2);
    expect(mockedSubmitExamAnswer).toHaveBeenLastCalledWith("contest-reset", "q1", { text: "latest answer during flush" });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledTimes(2);
  });

  it("does not retry an older failed write over a newer successful answer", async () => {
    let rejectOld!: (error: Error) => void;
    mockedSubmitExamAnswer.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const { result } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "older answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    act(() => result.current.handleAnswerChange("q1", "newer saved answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => { rejectOld(new Error("old request failed")); await Promise.resolve(); });
    await act(async () => { await result.current.flushAll(); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledTimes(2);
    expect(mockedSubmitExamAnswer).toHaveBeenLastCalledWith("contest-reset", "q1", { text: "newer saved answer" });
  });

  it.each([true, false])("rejects an old flush after a contest switch (save already running=%s)", async (alreadyRunning) => {
    let resolveOld!: () => void;
    mockedSubmitExamAnswer.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = () => resolve({} as never); }));
    const setAnswers = vi.fn();
    const { result, rerender } = renderHook(({ contestId }) => usePaperExamAutoSave({
      contestId, setAnswers: setAnswers as never,
    }), { initialProps: { contestId: "old-contest" } });
    act(() => result.current.handleAnswerChange("q1", "old answer", "essay"));
    if (alreadyRunning) await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    let flush!: Promise<void>;
    let rejection!: Promise<void>;
    await act(async () => {
      flush = result.current.flushAll();
      rejection = expect(flush).rejects.toThrow("Exam changed while saving answers");
    });
    rerender({ contestId: "new-contest" });
    act(() => result.current.handleAnswerChange("q1", "new answer", "essay"));
    await act(async () => { resolveOld(); await rejection; });
    await act(async () => { await result.current.flushAll(); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledTimes(2);
    expect(mockedSubmitExamAnswer).toHaveBeenLastCalledWith("new-contest", "q1", { text: "new answer" });
  });

  it("keeps the newest server answer when older and newer saves overlap before submission", async () => {
    let resolveOld!: () => void;
    let serverAnswer = "";
    mockedSubmitExamAnswer.mockImplementation((_contest, _question, payload) => {
      const text = String(payload.text);
      if (text === "older answer") return new Promise((resolve) => {
        resolveOld = () => { serverAnswer = text; resolve({} as never); };
      });
      serverAnswer = text;
      return Promise.resolve({} as never);
    });
    const { result } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "older answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    act(() => result.current.handleAnswerChange("q1", "newest answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    let flush!: Promise<void>;
    await act(async () => { flush = result.current.flushAll(); });
    await act(async () => { resolveOld(); await flush; });
    expect(serverAnswer).toBe("newest answer");
    expect(mockedSubmitExamAnswer).toHaveBeenCalledTimes(2);
  });

  it("cancels a queued write after unmount so the newest unsent draft survives", async () => {
    let resolveOld!: () => void;
    mockedSubmitExamAnswer.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = () => resolve({} as never); }));
    const { result, unmount } = renderHook(() => usePaperExamAutoSave({
      contestId: "contest-reset", setAnswers: vi.fn() as never,
    }));
    act(() => result.current.handleAnswerChange("q1", "running answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    act(() => result.current.handleAnswerChange("q1", "queued answer", "essay"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    act(() => result.current.handleAnswerChange("q1", "newest unsent draft", "essay"));
    unmount();
    expect(saveExamAnswerDraft).toHaveBeenLastCalledWith("contest-reset", "q1", { text: "newest unsent draft" });
    await act(async () => { resolveOld(); await Promise.resolve(); });
    expect(mockedSubmitExamAnswer).toHaveBeenCalledOnce();
    expect(saveExamAnswerDraft).toHaveBeenLastCalledWith("contest-reset", "q1", { text: "newest unsent draft" });
  });

});
