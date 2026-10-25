import { render, screen } from "@testing-library/react";
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
      onGo={vi.fn()}
      onOpenAll={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "下一項" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "上一項" })).toBeDisabled();
});
