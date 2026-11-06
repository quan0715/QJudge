import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ExamItem } from "../../types/exam.types";
import { ExamQuestionList } from "./ExamQuestionList";

afterEach(cleanup);

const question = (id: string, order: number, groupId: string | null = null) => ({
  kind: "question" as const,
  data: { id, order, groupId, questionType: "single_choice", prompt: `**題幹 ${id}**`, score: 5 },
}) as unknown as ExamItem;

const items = [question("a", 1), question("b", 2, "g"), question("c", 3, "g")];

it("labels grouped questions and selects by index in both widths", () => {
  const onSelect = vi.fn();
  const { rerender } = render(<ExamQuestionList items={items} activeIndex={0} answeredIds={new Set(["b"])} markedIds={new Set(["c"])} onSelect={onSelect} collapsed={false} />);
  expect(screen.getByText("第 2 題 · 題組")).toBeVisible();
  expect(screen.getByText("2(a)")).toBeVisible();
  fireEvent.click(screen.getByText("2(b)"));
  expect(onSelect).toHaveBeenCalledWith(2);

  rerender(<ExamQuestionList items={items} activeIndex={1} answeredIds={new Set(["b"])} markedIds={new Set(["c"])} onSelect={onSelect} collapsed />);
  expect(screen.queryByText("第 2 題 · 題組")).not.toBeInTheDocument();
  const current = screen.getByRole("button", { name: "Q2(a)，已作答" });
  expect(current).toHaveAttribute("aria-current", "step");
  fireEvent.click(screen.getByRole("button", { name: "Q2(b)，未作答，已標記" }));
  expect(onSelect).toHaveBeenLastCalledWith(2);
});
