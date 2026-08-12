import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScoreSlider from "./ScoreSlider";

describe("ScoreSlider", () => {
  it("exposes a labelled Carbon slider and exact numeric input", () => {
    render(
      <ScoreSlider
        label="批改分數"
        value={1}
        max={2}
        step={0.5}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("slider", { name: "批改分數" })).toBeInTheDocument();
    const exactInputRegion = screen.getByTestId("score-exact-input");
    expect(exactInputRegion).toContainElement(
      screen.getByRole("spinbutton", { name: "批改分數" }),
    );
  });

  it("reports exact score changes", () => {
    const onChange = vi.fn();
    render(
      <ScoreSlider
        label="批改分數"
        value={1}
        max={2}
        step={0.5}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "批改分數" }), {
      target: { value: "1.5" },
    });

    expect(onChange).toHaveBeenCalledWith(1.5);
  });

  it("keeps the score-proportional colour fill", () => {
    render(
      <ScoreSlider
        label="批改分數"
        value={2}
        max={2}
        step={0.5}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("score-slider-fill")).toHaveStyle({
      width: "max(1.5rem, 100%)",
    });
    expect(screen.getByTestId("score-slider-fill").style.background).toContain(
      "--cds-support-success",
    );
  });
});
