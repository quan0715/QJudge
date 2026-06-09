import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ExamPaper } from "@/core/entities/contest.entity";
import { getExamPaper } from "@/infrastructure/api/repositories/examPaper.repository";
import { getMyExamAnswers } from "@/infrastructure/api/repositories/examAnswers.repository";
import { ToastProvider } from "@/shared/contexts/ToastContext";

import { usePaperExamQuestions } from "./usePaperExamQuestions";

vi.mock("@/infrastructure/api/repositories/examPaper.repository", () => ({
  getExamPaper: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  getMyExamAnswers: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(ToastProvider, null, children);

describe("usePaperExamQuestions", () => {
  it("loads the composite paper while keeping navigation items flat", async () => {
    const paper: ExamPaper = {
      groups: [
        {
          id: "group-1",
          contestId: "contest-1",
          title: "題組",
          sharedStemMarkdown: "共同題幹",
          order: 1,
          totalScore: 10,
          createdAt: "",
          updatedAt: "",
        },
      ],
      questions: [
        {
          id: "q1",
          contestId: "contest-1",
          questionType: "essay",
          prompt: "第一題",
          options: [],
          explanation: "",
          score: 10,
          order: 1,
          groupId: "group-1",
          orderInGroup: 1,
          answerFormat: "markdown_math",
          createdAt: "",
          updatedAt: "",
        },
      ],
      sections: [],
    };

    vi.mocked(getExamPaper).mockResolvedValue(paper);
    vi.mocked(getMyExamAnswers).mockResolvedValue([]);

    const { result } = renderHook(() => usePaperExamQuestions("contest-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loadingQuestions).toBe(false));

    expect(getExamPaper).toHaveBeenCalledWith("contest-1");
    expect(result.current.groups).toEqual(paper.groups);
    expect(result.current.items).toEqual([
      {
        kind: "question",
        data: paper.questions[0],
      },
    ]);
  });

  it("ignores stale paper responses when contestId changes", async () => {
    let resolveFirst!: (paper: ExamPaper) => void;
    let resolveSecond!: (paper: ExamPaper) => void;
    const firstPaper = new Promise<ExamPaper>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPaper = new Promise<ExamPaper>((resolve) => {
      resolveSecond = resolve;
    });
    const createPaper = (contestId: string, questionId: string): ExamPaper => ({
      groups: [],
      questions: [
        {
          id: questionId,
          contestId,
          questionType: "essay",
          prompt: questionId,
          options: [],
          explanation: "",
          score: 10,
          order: 1,
          groupId: null,
          orderInGroup: null,
          answerFormat: "plain_text",
          createdAt: "",
          updatedAt: "",
        },
      ],
      sections: [
        {
          kind: "flat",
          item: {
            id: questionId,
            contestId,
            questionType: "essay",
            prompt: questionId,
            options: [],
            explanation: "",
            score: 10,
            order: 1,
            groupId: null,
            orderInGroup: null,
            answerFormat: "plain_text",
            createdAt: "",
            updatedAt: "",
          },
        },
      ],
    });

    vi.mocked(getExamPaper)
      .mockReturnValueOnce(firstPaper)
      .mockReturnValueOnce(secondPaper);
    vi.mocked(getMyExamAnswers).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ contestId }) => usePaperExamQuestions(contestId),
      {
        initialProps: { contestId: "contest-1" },
        wrapper,
      },
    );

    rerender({ contestId: "contest-2" });

    await act(async () => {
      resolveSecond(createPaper("contest-2", "q2"));
      await secondPaper;
    });

    await waitFor(() => expect(result.current.items[0]?.data.id).toBe("q2"));

    await act(async () => {
      resolveFirst(createPaper("contest-1", "q1"));
      await firstPaper;
    });

    expect(result.current.items[0]?.data.id).toBe("q2");
  });

  it("unwraps saved open document answers for the runtime editor", async () => {
    const document = {
      version: 1 as const,
      nodes: [
        {
          type: "paragraph" as const,
          children: [{ type: "text" as const, text: "已儲存推導" }],
        },
      ],
    };

    vi.mocked(getExamPaper).mockResolvedValue({
      groups: [],
      questions: [],
      sections: [],
    });
    vi.mocked(getMyExamAnswers).mockResolvedValue([
      {
        id: "answer-1",
        questionId: "q1",
        answer: { document },
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const { result } = renderHook(() => usePaperExamQuestions("contest-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.answers.q1).toEqual(document));
  });
});
