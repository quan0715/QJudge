import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProblemMenu } from "./ProblemMenu";

describe("ProblemMenu", () => {
  it("renders each problem as a keyboard-accessible control that selects it", () => {
    const onSelect = vi.fn();

    render(
      <ProblemMenu
        problems={[
          { id: "problem-a", label: "A", title: "Hello World", isSolved: false },
          { id: "problem-b", label: "B", title: "Two Sum", isSolved: false },
        ]}
        selectedProblemId="problem-a"
        onSelect={onSelect}
      />,
    );

    const firstProblem = screen.getByRole("button", { name: "A. Hello World" });
    expect(firstProblem).toHaveAttribute("data-active", "true");

    fireEvent.click(screen.getByRole("button", { name: "B. Two Sum" }));
    expect(onSelect).toHaveBeenCalledWith("problem-b");
  });
});
