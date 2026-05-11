import { renderHook, waitFor } from "@testing-library/react";
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
});
