import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";

import LockedGradingSaveModal from "./LockedGradingSaveModal";

describe("LockedGradingSaveModal", () => {
  it("offers only regrading for objective changes", () => {
    const onChoose = vi.fn();
    render(
      <ThemeProvider>
        <LockedGradingSaveModal
          open
          impact={{ kind: "objective-regrade", affectedCount: 18 }}
          resultsPublished
          submitting={false}
          onCancel={vi.fn()}
          onChoose={onChoose}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText(/18/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保留既有批改" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新批改" }));
    expect(onChoose).toHaveBeenCalledWith("regrade");
  });

  it("offers keep or mark-pending for subjective changes", () => {
    const onChoose = vi.fn();
    render(
      <ThemeProvider>
        <LockedGradingSaveModal
          open
          impact={{ kind: "subjective-review", affectedCount: 7 }}
          resultsPublished={false}
          submitting={false}
          onCancel={vi.fn()}
          onChoose={onChoose}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "標記為待批改" }));
    expect(onChoose).toHaveBeenCalledWith("mark_pending");
    fireEvent.click(screen.getByRole("button", { name: "保留既有批改" }));
    expect(onChoose).toHaveBeenCalledWith("keep");
  });
});
