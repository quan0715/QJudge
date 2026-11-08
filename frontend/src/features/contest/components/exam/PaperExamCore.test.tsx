import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamItem } from "../../types/exam.types";
import { PaperExamCore } from "./PaperExamCore";

vi.mock("./ExamNavigator", () => ({ ExamNavigator: ({ onSelect }: { onSelect: (index: number) => void }) => <button onClick={() => onSelect(0)}>First question</button> }));
const items: ExamItem[] = [0,1,2].map(index => ({ kind: "question", data: { id: String(index), contestId: "c", questionType: "essay", prompt: "Question", options: [], explanation: "", score: 5, order: index, createdAt: "", updatedAt: "" } }));

describe("paper answering navigation", () => {
  it("uses a deep link initially, then allows navigation; later links still work", () => {
    const props = { workbench: true, items, answeredIds: new Set<string>(), styles: {}, renderItem: (_item: ExamItem, index: number, _mode: unknown, footer?: ReactNode) => <><h1>Question {index + 1}</h1>{footer}</> };
    const { rerender } = render(<PaperExamCore {...props} syncIndex={1} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Question 2");
    fireEvent.click(screen.getByRole("button", { name: "answering.navigation.nextQuestion" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Question 3");
    fireEvent.click(screen.getByRole("button", { name: "First question" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Question 1");
    rerender(<PaperExamCore {...props} syncIndex={2} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Question 3");
  });
});
