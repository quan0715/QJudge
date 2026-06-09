import { renderHook, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExamAnswerPayload,
  usePaperExamAutoSave,
} from "./usePaperExamAutoSave";
import { submitExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";
import { createEmptyOpenAnswerDocument } from "@/shared/ui/editor";

vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  submitExamAnswer: vi.fn().mockResolvedValue({}),
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
    mockedSubmitExamAnswer.mockClear();
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
});
