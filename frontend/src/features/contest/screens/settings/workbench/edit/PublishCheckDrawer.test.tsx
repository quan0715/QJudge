import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ExamPublishIssueItem } from "@/features/contest/domain/examPublishIssues";
import { PublishCheckDrawer } from "./PublishCheckDrawer";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? "")),
  }),
}));
it("groups issues and picks a question before closing", () => {
  const items: ExamPublishIssueItem[] = [
    { questionId: "q1", kind: "missingAnswer", field: "answer" },
    { questionId: "q2", kind: "defaultContent", field: "prompt" },
  ];
  const onPick = vi.fn(),
    onClose = vi.fn();
  render(
    <PublishCheckDrawer
      open
      items={items}
      describe={(item) => ({
        label: item.questionId === "q1" ? "第 1 題" : "第 2 題",
        title: item.questionId,
        typeText: "單選題",
      })}
      onPick={onPick}
      onClose={onClose}
    />,
  );
  expect(
    screen.getByRole("heading", { name: /未設定正確答案.*1/ }),
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: /仍是預設內容.*1/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /第 1 題.*q1/ }));
  expect(onPick).toHaveBeenCalledWith(items[0]);
  expect(onClose).toHaveBeenCalled();
});
