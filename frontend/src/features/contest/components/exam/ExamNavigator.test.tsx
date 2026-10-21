import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ExamItem } from "../../types/exam.types";
import { ExamNavigator } from "./ExamNavigator";

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

  it("renders a text summary without embedding fenced code blocks", () => {
    const items: ExamItem[] = [{ kind: "question", data: createQuestion({
      prompt: "Consider **this code**:\n\n```cpp\nint secret = 1;\n```",
    }) }];
    const { container } = render(<ExamNavigator items={items} activeIndex={0} answeredIds={new Set()} onSelect={vi.fn()} />);
    expect(screen.getByText("Consider this code:")).toBeInTheDocument();
    expect(screen.queryByText(/int secret/)).not.toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
  });

  it.each([false, true])("keeps grouped labels when collapsed=%s and navigates to the original item", (collapsed) => {
    const onSelect = vi.fn();
    const items: ExamItem[] = [
      { kind: "question", data: createQuestion({ id: "a", groupId: "g" }) },
      { kind: "question", data: createQuestion({ id: "b", groupId: "g" }) },
      { kind: "question", data: createQuestion({ id: "c" }) },
    ];
    render(<ExamNavigator items={items} activeIndex={0} collapsed={collapsed} answeredIds={new Set()} onSelect={onSelect} />);
    expect(screen.getByText("Q1(a)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Q1(b)"));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.getByText("Q2")).toBeInTheDocument();
  });
});
