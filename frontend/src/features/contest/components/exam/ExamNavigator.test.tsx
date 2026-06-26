import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ExamItem } from "../../types/exam.types";
import { ExamNavigator } from "./ExamNavigator";

vi.mock("@/shared/ui/markdown/MarkdownContent", () => ({
  default: {
    Problem: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => (
      <div data-testid="problem-markdown-preview" className={className}>
        {children}
      </div>
    ),
  },
}));

const createQuestion = (partial: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: "q1",
  contestId: "contest-1",
  questionType: "single_choice",
  prompt: "坐標平面上，函數 $y=\\sin x$ 的圖形對稱於 $x=\\frac{\\pi}{2}$。",
  options: [],
  explanation: "",
  score: 6,
  order: 0,
  groupId: null,
  orderInGroup: null,
  answerFormat: "plain_text",
  createdAt: "",
  updatedAt: "",
  ...partial,
});

describe("ExamNavigator", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders question prompt previews through the problem markdown renderer", () => {
    const items: ExamItem[] = [
      { kind: "question", data: createQuestion() },
    ];

    render(
      <ExamNavigator
        items={items}
        activeIndex={0}
        answeredIds={new Set()}
        onSelect={vi.fn()}
      />,
    );

    const preview = screen.getByTestId("problem-markdown-preview");
    expect(preview).toHaveTextContent("\\frac{\\pi}{2}");
  });
});
