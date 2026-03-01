import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import WorkTree from "./WorkTree";

vi.mock("motion/react", () => ({
  Reorder: {
    Group: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => (
      <div className={className} data-testid="reorder-group">
        {children}
      </div>
    ),
    Item: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => (
      <div className={className}>
        {children}
      </div>
    ),
  },
  useDragControls: () => ({ start: vi.fn() }),
}));

const buildQuestion = (partial: Partial<ExamQuestion>): ExamQuestion => ({
  id: partial.id ?? "q-1",
  contestId: partial.contestId ?? "c-1",
  questionType: partial.questionType ?? "single_choice",
  prompt: partial.prompt ?? "Question prompt",
  options: partial.options ?? ["A", "B"],
  score: partial.score ?? 5,
  order: partial.order ?? 0,
  createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
  updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
});

describe("WorkTree", () => {
  it("shows empty state and footer together when there are no questions", () => {
    render(
      <WorkTree
        questions={[]}
        selectedId={null}
        frozen
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByTestId("work-tree-body")).toBeInTheDocument();
    expect(screen.getByText("尚無題目")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-footer")).toBeInTheDocument();
    expect(screen.getByText("0 題")).toBeInTheDocument();
    expect(screen.getByText("總分 0")).toBeInTheDocument();
    expect(screen.queryByTestId("reorder-group")).not.toBeInTheDocument();
  });

  it("shows skeleton in body and keeps footer visible while loading", () => {
    render(
      <WorkTree
        questions={[]}
        selectedId={null}
        loading
        frozen
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByTestId("work-tree-body")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-footer")).toBeInTheDocument();
    expect(screen.queryByText("尚無題目")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reorder-group")).not.toBeInTheDocument();
  });

  it("shows reorder list and computed summary when questions exist", () => {
    render(
      <WorkTree
        questions={[
          buildQuestion({ id: "q-1", score: 5, order: 0 }),
          buildQuestion({ id: "q-2", score: 7, order: 1 }),
        ]}
        selectedId="q-1"
        frozen={false}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByTestId("work-tree-body")).toBeInTheDocument();
    expect(screen.getByTestId("reorder-group")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-footer")).toBeInTheDocument();
    expect(screen.getByText("2 題")).toBeInTheDocument();
    expect(screen.getByText("總分 12")).toBeInTheDocument();
  });
});
