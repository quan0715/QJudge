import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ContestProblemTable from "./ContestProblemTable";

const problem = {
  id: "problem-1",
  label: "A",
  title: "Two Sum",
  difficulty: "easy" as const,
  maxScore: 100,
};

describe("ContestProblemTable", () => {
  it("separates the open and remove actions", () => {
    const onRowClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <ContestProblemTable
        problems={[problem]}
        onRowClick={onRowClick}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Two Sum" }));
    expect(onRowClick).toHaveBeenCalledWith(problem);

    fireEvent.click(screen.getByRole("button", { name: "移除題目" }));
    expect(onRemove).toHaveBeenCalledWith("problem-1");
    expect(onRowClick).toHaveBeenCalledOnce();
  });
});
