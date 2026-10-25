import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ExamPublishIssueItem } from "@/features/contest/domain/examPublishIssues";
import { PublishCheckBar } from "./PublishCheckBar";
it("disables next on the last issue", () => {
  const item: ExamPublishIssueItem = {
    questionId: "q1",
    kind: "missingAnswer",
    field: "answer",
  };
  render(
    <PublishCheckBar
      items={[item]}
      current={item}
      index={0}
      resolved={false}
      onGo={vi.fn()}
      onOpenAll={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "下一項" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "上一項" })).toBeDisabled();
});
it("offers the issue that took a fixed item's place as next", () => {
  const fixed: ExamPublishIssueItem = {
    questionId: "q1",
    kind: "missingAnswer",
    field: "answer",
  };
  const before: ExamPublishIssueItem = { ...fixed, questionId: "q0" };
  const after: ExamPublishIssueItem = { ...fixed, questionId: "q2" };
  const onGo = vi.fn();
  render(
    <PublishCheckBar
      items={[before, after]}
      current={fixed}
      index={1}
      resolved
      onGo={onGo}
      onOpenAll={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByText(/已修好/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一項" }));
  expect(onGo).toHaveBeenLastCalledWith(after);
  fireEvent.click(screen.getByRole("button", { name: "上一項" }));
  expect(onGo).toHaveBeenLastCalledWith(before);
});
