import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MathMarkdownEditor } from "./MathMarkdownEditor";

describe("MathMarkdownEditor", () => {
  it("inserts a fraction as a compact editable formula inside the answer flow", () => {
    const ControlledEditor = () => {
      const [value, setValue] = useState("");

      return (
        <>
          <MathMarkdownEditor
            value={value}
            onChange={setValue}
            ariaLabel="math answer"
          />
          <output aria-label="serialized answer">{value}</output>
        </>
      );
    };

    render(<ControlledEditor />);

    fireEvent.click(screen.getByRole("button", { name: "分式" }));

    expect(screen.getByLabelText("分子")).toBeInTheDocument();
    expect(screen.getByLabelText("分母")).toBeInTheDocument();
    expect(screen.queryByText("分子")).not.toBeInTheDocument();
    expect(screen.queryByText("分母")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/\\frac/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("分子"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("分母"), { target: { value: "5" } });

    expect(screen.getByLabelText("serialized answer")).toHaveTextContent(
      "$\\frac{2}{5}$",
    );
  });

  it("separates adjacent formulas so the rendered answer does not collapse into raw delimiters", () => {
    const ControlledEditor = () => {
      const [value, setValue] = useState("");

      return (
        <>
          <MathMarkdownEditor
            value={value}
            onChange={setValue}
            ariaLabel="math answer"
          />
          <output aria-label="serialized answer">{value}</output>
        </>
      );
    };

    render(<ControlledEditor />);

    fireEvent.click(screen.getByRole("button", { name: "分式" }));
    fireEvent.change(screen.getByLabelText("分子"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("分母"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "根號" }));
    fireEvent.change(screen.getByLabelText("根號內"), {
      target: { value: "2 + 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "角度 theta" }));

    const serialized = screen.getByLabelText("serialized answer").textContent ?? "";
    expect(serialized).toBe("$\\frac{1}{2}$ $\\sqrt{2 + 3}$ $\\theta$");
    expect(serialized).not.toContain("$$$");
  });

  it("renders existing $...$ math as a formula token and opens controls on click", () => {
    render(
      <MathMarkdownEditor
        value={"答案是 $\\frac{2}{5}$ 。"}
        onChange={vi.fn()}
        ariaLabel="math answer"
      />,
    );

    const textboxValues = screen
      .getAllByRole("textbox")
      .map((el) => (el as HTMLInputElement).value);
    expect(textboxValues).toContain("答案是 ");
    expect(screen.queryByLabelText("分子")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("分母")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/\\frac/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "編輯公式" }));

    expect(screen.getByLabelText("分子")).toHaveValue("2");
    expect(screen.getByLabelText("分母")).toHaveValue("5");
    expect(
      screen.getAllByRole("textbox").map((el) => (el as HTMLInputElement).value),
    ).toContain(" 。");
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
