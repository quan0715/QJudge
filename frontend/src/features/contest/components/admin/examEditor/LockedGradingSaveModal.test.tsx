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

  it.each(["loading", "error"] as const)("blocks both subjective actions when counts are %s", (impactStatus) => {
    const onChoose = vi.fn();
    render(
      <ThemeProvider>
        <LockedGradingSaveModal
          open
          impact={{ kind: "subjective-review", affectedCount: null }}
          impactStatus={impactStatus}
          resultsPublished={false}
          submitting={false}
          onCancel={vi.fn()}
          onChoose={onChoose}
        />
      </ThemeProvider>,
    );
    for (const name of ["保留既有批改", "標記為待批改"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").querySelector("strong")).toBeNull();
  });

  it("allows a verified zero count", () => {
    render(
      <ThemeProvider>
        <LockedGradingSaveModal
          open
          impact={{ kind: "objective-regrade", affectedCount: 0 }}
          impactStatus="loaded"
          resultsPublished={false}
          submitting={false}
          onCancel={vi.fn()}
          onChoose={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole("dialog").querySelector("strong")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "重新批改" })).toBeEnabled();
  });

});
