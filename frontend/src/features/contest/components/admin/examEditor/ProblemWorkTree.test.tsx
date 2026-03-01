import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import ProblemWorkTree from "./ProblemWorkTree";

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

const buildProblem = (partial: Partial<ContestProblemSummary>): ContestProblemSummary => ({
  id: partial.id ?? "cp-1",
  problemId: partial.problemId ?? "p-1",
  label: partial.label ?? "A",
  title: partial.title ?? "Sample Problem",
  order: partial.order ?? 0,
  score: partial.score ?? 100,
  difficulty: partial.difficulty ?? "easy",
  userStatus: partial.userStatus,
});

describe("ProblemWorkTree", () => {
  it("shows empty state and footer together when there are no problems", () => {
    render(
      <ProblemWorkTree
        problems={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByTestId("work-tree-body")).toBeInTheDocument();
    expect(screen.getByText("No problems yet")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-footer")).toBeInTheDocument();
    expect(screen.getByText("0 problems")).toBeInTheDocument();
    expect(screen.getByText("Total 0pt")).toBeInTheDocument();
    expect(screen.queryByTestId("reorder-group")).not.toBeInTheDocument();
  });

  it("shows skeleton in body and keeps footer visible while loading", () => {
    render(
      <ProblemWorkTree
        problems={[]}
        selectedId={null}
        loading
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByTestId("work-tree-body")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-footer")).toBeInTheDocument();
    expect(screen.queryByText("No problems yet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reorder-group")).not.toBeInTheDocument();
  });

  it("shows reorder list and computed summary when problems exist", () => {
    render(
      <ProblemWorkTree
        problems={[
          buildProblem({ id: "cp-1", score: 100 }),
          buildProblem({ id: "cp-2", score: 50, label: "B", order: 1 }),
        ]}
        selectedId="cp-1"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByTestId("work-tree-body")).toBeInTheDocument();
    expect(screen.getByTestId("reorder-group")).toBeInTheDocument();
    expect(screen.getByTestId("work-tree-footer")).toBeInTheDocument();
    expect(screen.getByText("2 problems")).toBeInTheDocument();
    expect(screen.getByText("Total 150pt")).toBeInTheDocument();
  });
});
