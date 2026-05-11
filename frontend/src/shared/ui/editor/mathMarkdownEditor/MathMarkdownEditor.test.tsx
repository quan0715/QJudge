import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MathMarkdownEditor } from "./MathMarkdownEditor";

describe("MathMarkdownEditor", () => {
  it("inserts a fraction template from the toolbar without requiring LaTeX typing", () => {
    const onChange = vi.fn();

    render(
      <MathMarkdownEditor
        value=""
        onChange={onChange}
        ariaLabel="math answer"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "分式" }));

    expect(onChange).toHaveBeenCalledWith("$\\frac{}{}$");
  });

  it("downgrades paste to plain text and routes changes through onChange", () => {
    const onChange = vi.fn();

    render(
      <MathMarkdownEditor
        value=""
        onChange={onChange}
        ariaLabel="math answer"
      />,
    );

    const textarea = screen.getByRole("textbox", { name: "math answer" });
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: () => "x^2 + 1",
      },
    });

    expect(onChange).toHaveBeenCalledWith("x^2 + 1");
  });
});
